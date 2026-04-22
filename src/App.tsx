import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Radar } from "lucide-react";

import { SAFE_ZONE, STORAGE_KEYS } from "./constants/app";
import Badge from "./components/ui/Badge";
import ControlDock from "./components/ui/ControlDock";
import OnboardingGuide from "./components/ui/OnboardingGuide";
import CaregiverView from "./views/CaregiverView";
import PatientView from "./views/PatientView";
import PatientViewUpdated from "./views/PatientView_Updated";
import { useAlerts } from "./hooks/useAlerts";
import { useLocationTracking } from "./hooks/useLocationTracking";
import { useMotionTracking } from "./hooks/useMotionTracking";
import { usePersistentState } from "./hooks/usePersistentState";
import { useVisionTracking } from "./hooks/useVisionTracking";
import { average, formatMeters } from "./lib/utils";
import type { AlertInput, GameSession, SafeZone, SensorStatus, UserView } from "./types/app";

export default function App() {
  const [view, setView] = useState<UserView>("patient");
  const [guideSettings, setGuideSettings] = usePersistentState(STORAGE_KEYS.onboardingGuide, {
    acknowledged: false,
  });
  const [guideOpen, setGuideOpen] = useState(false);
  const [voiceSettings, setVoiceSettings] = usePersistentState(STORAGE_KEYS.settings, {
    voiceEnabled: true,
  });
  const [storedTrail, setStoredTrail] = usePersistentState(STORAGE_KEYS.trail, []);
  const [gameHistory, setGameHistory] = usePersistentState(STORAGE_KEYS.gameHistory, []);
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
  } = useVisionTracking();

  const anomalyGuardRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    setStoredTrail(breadcrumbs);
  }, [breadcrumbs, setStoredTrail]);

  useEffect(() => {
    const guard = anomalyGuardRef.current;
    const checks: Array<{ key: string; active: boolean; payload: AlertInput }> = [
      {
        key: "geofence",
        active: locationAnalysis.outOfBounds,
        payload: {
          module: "Location",
          severity: "danger",
          title: "Out-of-bounds excursion",
          message: `Patient is ${formatMeters(locationAnalysis.currentDistance)} from ${safeZone.name}. Sending caregiver escalation.`,
          dedupeKey: "geofence",
        },
      },
      {
        key: "dwelling",
        active: locationAnalysis.dwelling.active,
        payload: {
          module: "Location",
          severity: "danger",
          title: "Dwelling / lost anomaly",
          message: `Patient remained in a ${Math.round(locationAnalysis.dwelling.diagonal)} meter box outside the safe zone for ${Math.round(locationAnalysis.dwelling.duration / 60000)} minutes.`,
          dedupeKey: "dwelling",
        },
      },
      {
        key: "fall",
        active: gait.fallDetected,
        payload: {
          module: "Gait",
          severity: "danger",
          title: "Fall signature detected",
          message: "Acceleration spike followed by motionlessness. Check patient immediately.",
          dedupeKey: "fall",
        },
      },
      {
        key: "shuffle",
        active: gait.label === "High fall risk",
        payload: {
          module: "Gait",
          severity: "warning",
          title: "Shuffling gait pattern",
          message: "Reduced vertical oscillation and unstable lateral movement suggest elevated fall risk.",
          dedupeKey: "shuffle",
        },
      },
    ];

    checks.forEach((check) => {
      if (check.active && !guard[check.key]) {
        addAlert(check.payload);
      }
      guard[check.key] = check.active;
    });
  }, [addAlert, gait, locationAnalysis, safeZone.name]);

  useEffect(() => {
    if (visionMetrics.risk === "High" && !anomalyGuardRef.current.vision) {
      addAlert({
        module: "Vision",
        severity: "warning",
        title: "High ocular latency",
        message: `Saccadic latency ${visionMetrics.latency}ms with fixation ${visionMetrics.fixation}%. Review diagnostic drift.`,
        dedupeKey: "vision-high-risk",
      });
      anomalyGuardRef.current.vision = true;
    }

    if (visionMetrics.risk !== "High") {
      anomalyGuardRef.current.vision = false;
    }
  }, [addAlert, visionMetrics]);

  function handleSessionRecorded(session: GameSession) {
    const finalizedHistory = gameHistory.filter((entry) => entry.status !== "checkpoint" && entry.id !== session.id);
    const historyBaseline = finalizedHistory.length
      ? {
          memorySpan: average(finalizedHistory.map((entry) => entry.memorySpan)),
          avgReaction: average(finalizedHistory.map((entry) => entry.avgReaction || 0)),
        }
      : null;

    setGameHistory((previous) => {
      const nextHistory = previous.some((entry) => entry.id === session.id)
        ? previous.map((entry) => (entry.id === session.id ? session : entry))
        : [...previous, session];
      return nextHistory.slice(-30);
    });

    if (session.status === "checkpoint") {
      return;
    }

    if (
      historyBaseline &&
      (session.memorySpan <= historyBaseline.memorySpan - 1 ||
        session.avgReaction >= historyBaseline.avgReaction * 1.2)
    ) {
      addAlert({
        module: "Cognition",
        severity: "warning",
        title: "Cognitive decline signal",
        message: `Current span ${session.memorySpan} vs baseline ${historyBaseline.memorySpan.toFixed(1)}; reaction ${Math.round(session.avgReaction)}ms vs baseline ${Math.round(historyBaseline.avgReaction)}ms.`,
        dedupeKey: `cognition-${session.id}`,
      });
    } else {
      addAlert({
        module: "Cognition",
        severity: "info",
        title: "Assessment session logged",
        message: `Memory span ${session.memorySpan} recorded with average reaction ${Math.round(session.avgReaction)}ms.`,
        dedupeKey: `session-${session.id}`,
      });
    }
  }

  const patientStatus = locationAnalysis.outOfBounds
    ? "Please stay near your safe route."
    : gait.label === "High fall risk"
      ? "Walk carefully and use support if needed."
      : "Everything looks steady right now.";

  const sensorStatus = useMemo<SensorStatus>(
    () => ({
      geo: geoStatus,
      motion: motionStatus,
      camera: cameraStatus,
      vision: visionStatus,
    }),
    [cameraStatus, geoStatus, motionStatus, visionStatus],
  );

  const trackingStatus =
    visionMetrics.trackingMode === "live-mesh"
      ? "Live eye mesh"
      : visionMetrics.trackingMode === "camera-search" || sensorStatus.vision === "loading"
        ? "Vision initializing"
        : "Vision ready";

  useEffect(() => {
    if (!guideSettings.acknowledged) {
      setGuideOpen(true);
    }
  }, [guideSettings.acknowledged]);

  function handleCloseGuide() {
    setGuideOpen(false);
    setGuideSettings({ acknowledged: true });
  }

  function handleBeginGuide() {
    handleCloseGuide();
  }

  const handleSafeZoneChange = (next: SafeZone) => setSafeZone(next);
  const handleSafeZoneReset = () => setSafeZone(SAFE_ZONE);
  const handleGeoToggle = () =>
    sensorStatus.geo === "live" ? disableGeolocation() : void enableGeolocation(addAlert);
  const handleMotionToggle = () =>
    sensorStatus.motion === "live" ? disableMotion() : void enableMotion(addAlert);
  const handleCameraToggle = () =>
    sensorStatus.camera === "live" ? disableCamera() : void enableCamera(addAlert);

  return (
    <div className="min-h-screen px-4 py-5 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-375 flex-col gap-6">
        <header className="glass relative overflow-hidden rounded-4xl border border-white/10 bg-slate-950/65 px-5 py-5 shadow-(--shadow-halo) md:px-7">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-linear-to-l from-cyan/8 to-transparent"></div>
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-300">
                <Radar size={14} />
                CogniTrack PWA concept
              </div>
              <h1 className="mt-4 font-display text-4xl leading-tight text-white md:text-5xl">
                Integrated Alzheimer’s detection, safety monitoring, and cognitive maintenance.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                React-driven dual-mode interface with live sensor integrations and explicit anomaly math for wandering,
                gait risk, ocular tracking, and memory decline.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button
                  onClick={() => setGuideOpen(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-semibold text-white"
                >
                  <HelpCircle size={18} />
                  Guide
                </button>
              </div>
              <div className="flex gap-3 rounded-[26px] border border-white/10 bg-white/5 p-2">
                <button
                  onClick={() => setView("patient")}
                  className={
                    view === "patient"
                      ? "rounded-[18px] bg-mist px-4 py-3 text-sm font-semibold text-ink"
                      : "rounded-[18px] px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                  }
                >
                  Patient view
                </button>
                <button
                  onClick={() => setView("caregiver")}
                  className={
                    view === "caregiver"
                      ? "rounded-[18px] bg-cyan px-4 py-3 text-sm font-semibold text-ink"
                      : "rounded-[18px] px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                  }
                >
                  Caregiver view
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={sensorStatus.geo === "live" ? "good" : "info"}>
                  {sensorStatus.geo === "live" ? "GPS linked" : "GPS ready"}
                </Badge>
                <Badge tone={sensorStatus.motion === "live" ? "good" : "info"}>
                  {sensorStatus.motion === "live" ? "Motion live" : "Motion ready"}
                </Badge>
                <Badge tone={sensorStatus.camera === "live" ? "good" : "calm"}>
                  {sensorStatus.camera === "live" ? "Camera active" : "Camera standby"}
                </Badge>
                <Badge tone={visionMetrics.trackingMode === "live-mesh" ? "good" : "info"}>
                  {trackingStatus}
                </Badge>
              </div>
            </div>
          </div>
          <div className="relative z-10 mt-5 grid gap-3 border-t border-white/10 pt-5 md:grid-cols-3 xl:grid-cols-4">
            <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Patient condition</div>
              <div className="mt-2 text-xl font-semibold text-white">{patientStatus}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Active alerts</div>
              <div className="mt-2 text-xl font-semibold text-white">{alerts.length}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Cognitive sessions</div>
              <div className="mt-2 text-xl font-semibold text-white">{gameHistory.length}</div>
            </div>
            <button
              onMouseEnter={prewarmVisionRuntime}
              onFocus={prewarmVisionRuntime}
              className="rounded-[22px] border border-cyan/20 bg-cyan/10 p-4 text-left"
            >
              <div className="text-[11px] uppercase tracking-[0.28em] text-cyan">Vision runtime</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {sensorStatus.vision === "loading" ? "Prewarming" : trackingStatus}
              </div>
            </button>
          </div>
        </header>

        {view === "patient" ? (
          <PatientViewUpdated
            alerts={alerts}
            canvasRef={canvasRef}
            onToggleCamera={handleCameraToggle}
            onToggleGeolocation={handleGeoToggle}
            onToggleMotion={handleMotionToggle}
            gait={gait}
            handleSessionRecorded={handleSessionRecorded}
            locationAnalysis={locationAnalysis}
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
            onToggleCamera={handleCameraToggle}
            onToggleGeolocation={handleGeoToggle}
            onToggleMotion={handleMotionToggle}
            onResetSafeZone={handleSafeZoneReset}
            onSafeZoneChange={handleSafeZoneChange}
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

        <ControlDock
          locationScenario={locationScenario}
          motionScenario={motionScenario}
          setLocationScenario={setLocationScenario}
          setMotionScenario={setMotionScenario}
        />

        <footer className="px-1 pb-4 text-center text-xs uppercase tracking-[0.28em] text-slate-500">
          Run over localhost or HTTPS to unlock secure-context APIs like camera and motion permissions.
        </footer>
      </div>

      <OnboardingGuide open={guideOpen} onClose={handleCloseGuide} onBegin={handleBeginGuide} />
    </div>
  );
}
