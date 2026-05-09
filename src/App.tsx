import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorBoundary } from "./components/ErrorBoundary";
import OnboardingGuide from "./components/ui/OnboardingGuide";
import { ParametersModal } from "./components/ui/ParametersModal";
import { Toaster } from "./components/ui/Toaster";
import { SAFE_ZONE, STORAGE_KEYS } from "./constants/app";
import {
  DEFAULT_CONTACTS,
  DEFAULT_MEMORIES,
  DEFAULT_PROFILE,
  DEFAULT_REMINDERS,
  type CareContact,
  type CareMemory,
  type CareReminder,
  type PatientProfile,
} from "./features/care/types";
import type {
  PursuitResult,
  StoredPursuitResult,
} from "./features/vision/pursuit-analysis";
import { useVision } from "./features/vision/useVision";
import { useAlerts } from "./hooks/useAlerts";
import {
  compareCognitionSession,
  useAlertOrchestration,
} from "./hooks/useAlertOrchestration";
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
import CaregiverView from "./views/CaregiverView";
import PatientView from "./views/PatientView";

export default function App() {
  const [view, setView] = usePersistentState<UserView>("cognitrack.activeView", "patient");
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

  const [profile, setProfile] = usePersistentState<PatientProfile>(
    STORAGE_KEYS.profile,
    DEFAULT_PROFILE,
  );
  const [contacts, setContacts] = usePersistentState<CareContact[]>(
    STORAGE_KEYS.contacts,
    DEFAULT_CONTACTS,
  );
  const [reminders, setReminders] = usePersistentState<CareReminder[]>(
    STORAGE_KEYS.reminders,
    DEFAULT_REMINDERS,
  );
  const [memories, setMemories] = usePersistentState<CareMemory[]>(
    STORAGE_KEYS.memories,
    DEFAULT_MEMORIES,
  );
  const [pursuitHistory, setPursuitHistory] = usePersistentState<StoredPursuitResult[]>(
    STORAGE_KEYS.pursuitHistory,
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
  } = useLocationTracking(storedTrail, safeZone);

  const {
    motionScenario,
    setMotionScenario,
    motionStatus,
    motionSamples,
    gait,
    enableMotion,
    disableMotion,
  } = useMotionTracking();

  const {
    videoRef,
    canvasRef,
    cameraStatus,
    visionStatus,
    visionMetrics,
    enableCamera,
    disableCamera,
    prewarmVisionRuntime,
  } = useVision();

  useEffect(() => {
    const realBreadcrumbs = breadcrumbs.filter((point) => !point.simulated);
    setStoredTrail(realBreadcrumbs);
  }, [breadcrumbs, setStoredTrail]);

  useAlertOrchestration({ addAlert, locationAnalysis, gait, visionMetrics, safeZone });

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
  const handleCameraToggle = useCallback(() => {
    if (sensorStatus.camera === "live") disableCamera();
    else void enableCamera(addAlert);
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

  const handleToggleReminder = useCallback(
    (id: string) => {
      setReminders((previous) =>
        previous.map((reminder) =>
          reminder.id === id
            ? {
                ...reminder,
                completedAt: reminder.completedAt === null ? Date.now() : null,
              }
            : reminder,
        ),
      );
    },
    [setReminders],
  );

  const handleResetData = useCallback(() => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm(
      "Reset all locally stored CogniTrack data? This clears the trail, game history, profile, contacts, reminders, and memories.",
    );
    if (!confirmed) return;
    setStoredTrail([]);
    setGameHistory([]);
    setSafeZone(SAFE_ZONE);
    setProfile(DEFAULT_PROFILE);
    setContacts(DEFAULT_CONTACTS);
    setReminders(DEFAULT_REMINDERS);
    setMemories(DEFAULT_MEMORIES);
    setPursuitHistory([]);
    setGuideSettings({ acknowledged: false });
    clearAlerts();
  }, [
    clearAlerts,
    setContacts,
    setGameHistory,
    setGuideSettings,
    setMemories,
    setProfile,
    setPursuitHistory,
    setReminders,
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
            profile={profile}
            contacts={contacts}
            reminders={reminders}
            memories={memories}
            onToggleReminder={handleToggleReminder}
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
            onResetSafeZone={handleSafeZoneReset}
            onSafeZoneChange={handleSafeZoneChange}
            onToggleCamera={handleCameraToggle}
            onToggleGeolocation={handleGeoToggle}
            onToggleMotion={handleMotionToggle}
            prewarmVisionRuntime={prewarmVisionRuntime}
            safeZone={safeZone}
            sensorStatus={sensorStatus}
            setView={setView}
            setVoiceSettings={setVoiceSettings}
            videoRef={videoRef}
            visionMetrics={visionMetrics}
            voiceEnabled={voiceSettings.voiceEnabled}
            pursuitHistory={pursuitHistory}
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
        view={view}
        onViewChange={setView}
        locationScenario={locationScenario}
        onLocationScenarioChange={setLocationScenario}
        motionScenario={motionScenario}
        onMotionScenarioChange={setMotionScenario}
        onResetData={handleResetData}
      />

      <OnboardingGuide
        open={guideOpen}
        currentView={view}
        onClose={handleCloseGuide}
        onSwitchView={setView}
      />
      <Toaster />
    </div>
  );
}
