import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { ParametersModal } from "./components/ui/ParametersModal";
import { lazyWithRetry } from "./lib/chunk-recovery";

// Lazy-loaded: the user guide carries ~24 KiB of help content but isn't
// shown on first paint. Heavy enough to be worth deferring.
const OnboardingGuide = lazyWithRetry(() => import("./components/ui/OnboardingGuide"));
import { Toaster } from "./components/ui/Toaster";
import { SAFE_ZONE, STORAGE_KEYS } from "./constants/app";
import {
  computeCalibration,
  type CalibrationModel,
  type CalibrationSample,
} from "./features/vision/calibration";
import type {
  PursuitResult,
  StoredPursuitResult,
} from "./features/vision/pursuit-analysis";
import { useVision } from "./features/vision/useVision";
import { useAlerts } from "./hooks/useAlerts";
import {
  CLICK_STREAM_MAX_SAMPLES,
  useClickStreamCalibration,
} from "./hooks/useClickStreamCalibration";
import {
  compareCognitionSession,
  useAlertOrchestration,
} from "./hooks/useAlertOrchestration";
import {
  DEFAULT_GEOFENCE_SETTINGS,
  detectWandering,
  type GeofenceSettings,
} from "./features/location/lib/geofence";
import { useLocationTracking } from "./hooks/useLocationTracking";
import { useMotionTracking } from "./hooks/useMotionTracking";
import { usePersistentState } from "./hooks/usePersistentState";
import type {
  GameSession,
  LocationPoint,
  SafeZone,
  SensorStatus,
  UserView,
} from "./types/app";
import { useAuth } from "./auth/AuthContext";
import { useBackendContacts } from "./hooks/useBackendContacts";
import { useBackendMemories } from "./hooks/useBackendMemories";
import { useBackendProfile } from "./hooks/useBackendProfile";
import { useBackendReminders } from "./hooks/useBackendReminders";
import { useLiveStreamSender } from "./ws/useLiveStream";
import CaregiverView from "./views/CaregiverView";
import PatientView from "./views/PatientView";

export default function App() {
  // The view (patient vs caregiver UI) is now derived from the signed-in
  // user's role — no manual toggle. AuthGate guarantees `user` is present
  // by the time this component renders.
  const { user } = useAuth();
  const view: UserView = user?.role === "caregiver" ? "caregiver" : "patient";
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState(
    "cognitrack.sidebarCollapsed",
    false,
  );
  const [parametersOpen, setParametersOpen] = useState(false);
  const [guideSettings, setGuideSettings] = usePersistentState(STORAGE_KEYS.onboardingGuide, {
    acknowledged: false,
  });
  const [guideOpen, setGuideOpen] = useState(false);
  const [voiceSettings, setVoiceSettings] = usePersistentState(STORAGE_KEYS.settings, {
    voiceEnabled: true,
  });
  const [storedTrail, setStoredTrail] = usePersistentState<LocationPoint[]>(
    STORAGE_KEYS.trail,
    [],
  );
  const [gameHistory, setGameHistory] = usePersistentState<GameSession[]>(
    STORAGE_KEYS.gameHistory,
    [],
  );
  const [safeZone, setSafeZone] = usePersistentState<SafeZone>(STORAGE_KEYS.safeZone, SAFE_ZONE);
  const [geofence, setGeofence] = usePersistentState<GeofenceSettings>(
    STORAGE_KEYS.geofence,
    DEFAULT_GEOFENCE_SETTINGS,
  );

  // Profile / contacts / reminders / memories all live on the backend.
  // The `useBackend*` hooks expose the same `[value, setter]` tuple shape
  // downstream scenes already expect (the editors call `onChange(nextList)`
  // with the full list after every edit), so the swap is transparent —
  // the diff inside each shim turns a list-level write into the
  // appropriate create / patch / delete REST calls. Previously these
  // four resources were `usePersistentState` only, which meant caregiver
  // edits never reached the server and the patient device saw a stale
  // view forever.
  const [profile, setProfile] = useBackendProfile();
  const [contacts, setContacts] = useBackendContacts();
  const [reminders, setReminders, toggleReminderBackend] = useBackendReminders();
  const [memories, setMemories] = useBackendMemories();
  const [pursuitHistory, setPursuitHistory] = usePersistentState<StoredPursuitResult[]>(
    STORAGE_KEYS.pursuitHistory,
    [],
  );
  const [simulationsEnabled, setSimulationsEnabled] = usePersistentState(
    STORAGE_KEYS.simulations,
    false,
  );
  const [gazeCalibration, setGazeCalibration] = usePersistentState<CalibrationModel | null>(
    STORAGE_KEYS.gazeCalibration,
    null,
  );
  const [implicitSamples, setImplicitSamples] = usePersistentState<CalibrationSample[]>(
    STORAGE_KEYS.implicitCalibrationSamples,
    [],
  );

  const { alerts, addAlert, dismissAlert, clearAlerts } = useAlerts();

  const {
    breadcrumbs,
    locationScenario,
    setLocationScenario,
    geoStatus,
    locationAnalysis,
    enableGeolocation,
    disableGeolocation,
  } = useLocationTracking({
    initialBreadcrumbs: storedTrail,
    safeZone,
    simulate: simulationsEnabled,
  });

  const {
    motionScenario,
    setMotionScenario,
    motionStatus,
    motionSamples,
    gait,
    enableMotion,
    disableMotion,
  } = useMotionTracking({ simulate: simulationsEnabled });

  const {
    videoRef,
    canvasRef,
    cameraStatus,
    visionStatus,
    visionMetrics,
    enableCamera,
    disableCamera,
    prewarmVisionRuntime,
    attachStreamTo,
    latestLandmarksRef,
    getMeshTessellation,
  } = useVision({ simulate: simulationsEnabled });

  useEffect(() => {
    const realBreadcrumbs = breadcrumbs.filter((point) => !point.simulated);
    setStoredTrail(realBreadcrumbs);
  }, [breadcrumbs, setStoredTrail]);

  // Wandering detector runs over the live breadcrumb trail.
  const wandering = useMemo(
    () => detectWandering(locationAnalysis.breadcrumbTrail),
    [locationAnalysis.breadcrumbTrail],
  );

  useAlertOrchestration({
    addAlert,
    locationAnalysis,
    gait,
    visionMetrics,
    safeZone,
    geofence,
    wandering,
  });

  // Implicit calibration: every click is a fixation. Buffer the (gaze, pos)
  // pairs so the user can refine the explicit calibration without redoing
  // the 9-point dance.
  useClickStreamCalibration({
    visionMetrics,
    enabled: visionMetrics.faceDetected && gazeCalibration !== null,
    onSample: (sample) => {
      setImplicitSamples((prev) => [...prev, sample].slice(-CLICK_STREAM_MAX_SAMPLES));
    },
  });

  const handleSessionRecorded = useCallback(
    (session: GameSession) => {
      setGameHistory((previous) => {
        const exists = previous.some((entry) => entry.id === session.id);
        const next = exists
          ? previous.map((entry) => (entry.id === session.id ? session : entry))
          : [...previous, session];
        return next.slice(-30);
      });
      compareCognitionSession(session, gameHistory, addAlert);
    },
    [addAlert, gameHistory, setGameHistory],
  );

  useEffect(() => {
    if (!guideSettings.acknowledged) setGuideOpen(true);
  }, [guideSettings.acknowledged]);

  const handleCloseGuide = useCallback(() => {
    setGuideOpen(false);
    setGuideSettings({ acknowledged: true });
  }, [setGuideSettings]);

  const sensorStatus = useMemo<SensorStatus>(
    () => ({
      geo: geoStatus,
      motion: motionStatus,
      camera: cameraStatus,
      vision: visionStatus,
    }),
    [cameraStatus, geoStatus, motionStatus, visionStatus],
  );

  const patientStatus = locationAnalysis.outOfBounds
    ? "Stay near your safe route."
    : gait.label === "Fall detected"
      ? "Take a moment — we noticed a possible fall."
      : gait.label === "High fall risk"
        ? "Walk carefully and use support if needed."
        : "Everything looks steady right now.";

  const handleSafeZoneChange = useCallback(
    (next: SafeZone) => setSafeZone(next),
    [setSafeZone],
  );
  const handleSafeZoneReset = useCallback(() => setSafeZone(SAFE_ZONE), [setSafeZone]);
  const handleGeoToggle = useCallback(() => {
    if (sensorStatus.geo === "live") disableGeolocation();
    else void enableGeolocation(addAlert);
  }, [addAlert, disableGeolocation, enableGeolocation, sensorStatus.geo]);
  const handleMotionToggle = useCallback(() => {
    if (sensorStatus.motion === "live") disableMotion();
    else void enableMotion(addAlert);
  }, [addAlert, disableMotion, enableMotion, sensorStatus.motion]);

  // Auto-enable motion on mount — DeviceMotion doesn't need a user
  // permission gesture except on iOS Safari, where `requestPermission()`
  // will fall through to "offline" until the user explicitly grants it.
  // Either way we silently try once; on platforms that don't need
  // permission this just turns motion on so gait works without an
  // intermediate "Enable motion" tap.
  useEffect(() => {
    if (sensorStatus.motion === "offline") void enableMotion();
    // Run only once on mount; subsequent toggles go through the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleCameraToggle = useCallback(() => {
    if (sensorStatus.camera === "live") disableCamera();
    else
      void enableCamera((alert) => {
        // Always log + surface a visible toast on camera errors. The alert
        // feed isn't visible from the patient view, so without the toast
        // the user just sees the Enable button do nothing.
        addAlert(alert);
        toast.error(alert.title, { description: alert.message });
      });
  }, [addAlert, disableCamera, enableCamera, sensorStatus.camera]);

  const handlePursuitComplete = useCallback(
    (result: PursuitResult) => {
      const stored: StoredPursuitResult = {
        ...result,
        id: `pursuit-${Date.now()}`,
        createdAt: Date.now(),
      };
      setPursuitHistory((previous) => [...previous, stored].slice(-30));
    },
    [setPursuitHistory],
  );

  const handleRefineCalibration = useCallback(() => {
    if (implicitSamples.length < 8) return;
    const refined = computeCalibration(implicitSamples);
    if (refined) setGazeCalibration(refined);
  }, [implicitSamples, setGazeCalibration]);

  // Backed by /api/v1/reminders/{id}/toggle on the server. The dedicated
  // endpoint avoids the read-modify-write race a generic PATCH would
  // have when two devices toggle the same reminder concurrently.
  const handleToggleReminder = useCallback(
    (id: string) => toggleReminderBackend(id),
    [toggleReminderBackend],
  );

  // Patient-side live stream sender — 1 Hz aggregated snapshot. Caregivers
  // subscribed via WebSocket see this in real time on their dashboard.
  useLiveStreamSender(
    useCallback(
      () =>
        view === "patient"
          ? {
              vision: {
                ear: visionMetrics.ear,
                blinkRate: visionMetrics.blinkRate,
                fixation: visionMetrics.fixation,
                faceDetected: visionMetrics.faceDetected,
                risk: visionMetrics.risk,
              },
              gait: { label: gait.label, riskScore: gait.riskScore },
              location: locationAnalysis.latest
                ? { lat: locationAnalysis.latest.lat, lng: locationAnalysis.latest.lng }
                : null,
              outOfBounds: locationAnalysis.outOfBounds,
              wandering: wandering.active,
            }
          : null,
      [view, visionMetrics, gait, locationAnalysis, wandering.active],
    ),
    view === "patient",
  );

  const handleResetData = useCallback(() => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm(
      "Reset locally stored CogniTrack data on this device? This clears the trail, game history, pursuit history, calibration, and the safe-zone. Profile / contacts / reminders / memories live on the server and are NOT touched by this reset — use Account → Delete account for those.",
    );
    if (!confirmed) return;
    setStoredTrail([]);
    setGameHistory([]);
    setSafeZone(SAFE_ZONE);
    setPursuitHistory([]);
    setGazeCalibration(null);
    setImplicitSamples([]);
    setGuideSettings({ acknowledged: false });
    clearAlerts();
  }, [
    clearAlerts,
    setGameHistory,
    setGazeCalibration,
    setGuideSettings,
    setImplicitSamples,
    setPursuitHistory,
    setSafeZone,
    setStoredTrail,
  ]);

  const setVoiceEnabled = useCallback(
    (enabled: boolean) => setVoiceSettings({ voiceEnabled: enabled }),
    [setVoiceSettings],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      <ErrorBoundary scope="Active view">
        {view === "patient" ? (
          <PatientView
            alerts={alerts}
            gameHistory={gameHistory}
            canvasRef={canvasRef}
            gait={gait}
            handleSessionRecorded={handleSessionRecorded}
            locationAnalysis={locationAnalysis}
            onToggleCamera={handleCameraToggle}
            onToggleGeolocation={handleGeoToggle}
            onToggleMotion={handleMotionToggle}
            patientStatus={patientStatus}
            prewarmVisionRuntime={prewarmVisionRuntime}
            safeZone={safeZone}
            sensorStatus={sensorStatus}
            videoRef={videoRef}
            visionMetrics={visionMetrics}
            voiceEnabled={voiceSettings.voiceEnabled}
            onVoiceEnabledChange={setVoiceEnabled}
            onPursuitComplete={handlePursuitComplete}
            pursuitHistory={pursuitHistory}
            gazeCalibration={gazeCalibration}
            onGazeCalibrationChange={setGazeCalibration}
            implicitSampleCount={implicitSamples.length}
            onRefineCalibration={handleRefineCalibration}
            attachStreamTo={attachStreamTo}
            latestLandmarksRef={latestLandmarksRef}
            getMeshTessellation={getMeshTessellation}
            profile={profile}
            onProfileChange={setProfile}
            contacts={contacts}
            reminders={reminders}
            memories={memories}
            onToggleReminder={handleToggleReminder}
            onContactsChange={setContacts}
            onMemoriesChange={setMemories}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onOpenGuide={() => setGuideOpen(true)}
            onOpenParameters={() => setParametersOpen(true)}
          />
        ) : (
          <CaregiverView
            alerts={alerts}
            canvasRef={canvasRef}
            clearAlerts={clearAlerts}
            dismissAlert={dismissAlert}
            gait={gait}
            gameHistory={gameHistory}
            locationAnalysis={locationAnalysis}
            locationScenario={locationScenario}
            motionSamples={motionSamples}
            geofence={geofence}
            onGeofenceChange={setGeofence}
            wanderingActive={wandering.active}
            sensorStatus={sensorStatus}
            visionMetrics={visionMetrics}
            pursuitHistory={pursuitHistory}
            gazeCalibration={gazeCalibration}
            onGazeCalibrationChange={setGazeCalibration}
            onToggleCamera={handleCameraToggle}
            onPursuitComplete={handlePursuitComplete}
            implicitSampleCount={implicitSamples.length}
            onRefineCalibration={handleRefineCalibration}
            attachStreamTo={attachStreamTo}
            latestLandmarksRef={latestLandmarksRef}
            getMeshTessellation={getMeshTessellation}
            profile={profile}
            contacts={contacts}
            reminders={reminders}
            memories={memories}
            onProfileChange={setProfile}
            onContactsChange={setContacts}
            onRemindersChange={setReminders}
            onMemoriesChange={setMemories}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onOpenGuide={() => setGuideOpen(true)}
            onOpenParameters={() => setParametersOpen(true)}
          />
        )}
      </ErrorBoundary>

      <ParametersModal
        open={parametersOpen}
        onOpenChange={setParametersOpen}
        simulationsEnabled={simulationsEnabled}
        onSimulationsEnabledChange={setSimulationsEnabled}
        locationScenario={locationScenario}
        onLocationScenarioChange={setLocationScenario}
        motionScenario={motionScenario}
        onMotionScenarioChange={setMotionScenario}
        sensorStatus={sensorStatus}
        visionMetrics={visionMetrics}
        gait={gait}
        locationAnalysis={locationAnalysis}
        motionSampleCount={motionSamples.length}
        pursuitSessionCount={pursuitHistory.length}
        cognitiveSessionCount={gameHistory.length}
        onResetData={handleResetData}
      />

      {/* Render the lazy guide only after it's been opened at least once,
          so the bundle isn't fetched on initial paint. */}
      {guideOpen ? (
        <Suspense fallback={null}>
          <OnboardingGuide
            open={guideOpen}
            currentView={view}
            onClose={handleCloseGuide}
          />
        </Suspense>
      ) : null}
      <Toaster />
    </div>
  );
}
