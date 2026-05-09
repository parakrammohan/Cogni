import { useCallback, useEffect, useMemo, useState } from "react";

import { AppHeader } from "./components/layout/AppHeader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ControlDock from "./components/ui/ControlDock";
import OnboardingGuide from "./components/ui/OnboardingGuide";
import { Toaster } from "./components/ui/Toaster";
import { SAFE_ZONE, STORAGE_KEYS } from "./constants/app";
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
  const [view, setView] = useState<UserView>("patient");
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

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <AppHeader view={view} onViewChange={setView} onOpenGuide={() => setGuideOpen(true)} />

        <main id="main-content" className="pb-6">
          <ErrorBoundary scope="Active view">
            {view === "patient" ? (
              <PatientView
                alerts={alerts}
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
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      <ControlDock
        locationScenario={locationScenario}
        motionScenario={motionScenario}
        setLocationScenario={setLocationScenario}
        setMotionScenario={setMotionScenario}
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
