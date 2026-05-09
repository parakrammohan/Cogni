import type { Dispatch, RefObject, SetStateAction } from "react";
import { Activity, AudioLines, Camera, MapPinned, ShieldCheck } from "lucide-react";

import AlertsPanel from "../components/panels/AlertsPanel";
import GaitPanel from "../components/panels/GaitPanel";
import MapPanel from "../components/panels/MapPanel";
import TrendPanel from "../components/panels/TrendPanel";
import { Button } from "../components/ui/Button";
import SectionShell from "../components/ui/SectionShell";
import SensorButton from "../components/ui/SensorButton";
import SensorStatusGrid from "../components/ui/SensorStatusGrid";
import StatusBoard from "../components/ui/StatusBoard";
import { Switch } from "../components/ui/Switch";
import { faceLockTone, riskTone, trackerLabel, trackerTone, sensorLabel, sensorTone } from "../lib/tone";
import type {
  AppAlert,
  GaitAnalysis,
  GameSession,
  LocationAnalysis,
  MotionSample,
  SafeZone,
  SensorStatus,
  UserView,
  VisionMetrics,
} from "../types/app";

interface CaregiverViewProps {
  alerts: AppAlert[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
  gait: GaitAnalysis;
  gameHistory: GameSession[];
  locationAnalysis: LocationAnalysis;
  locationScenario: string;
  motionSamples: MotionSample[];
  onResetSafeZone: () => void;
  onSafeZoneChange: (next: SafeZone) => void;
  onToggleCamera: () => void;
  onToggleGeolocation: () => void;
  onToggleMotion: () => void;
  prewarmVisionRuntime: () => Promise<void>;
  safeZone: SafeZone;
  sensorStatus: SensorStatus;
  setView: Dispatch<SetStateAction<UserView>>;
  setVoiceSettings: Dispatch<SetStateAction<{ voiceEnabled: boolean }>>;
  videoRef: RefObject<HTMLVideoElement | null>;
  visionMetrics: VisionMetrics;
  voiceEnabled: boolean;
}

function gaitRiskClasses(label: GaitAnalysis["label"]): {
  surface: string;
  text: string;
} {
  if (label === "Fall detected") {
    return { surface: "border-red-200 bg-red-50", text: "text-red-700" };
  }
  if (label === "High fall risk") {
    return { surface: "border-amber-200 bg-amber-50", text: "text-amber-700" };
  }
  if (label === "Irregular") {
    return { surface: "border-sky-200 bg-sky-50", text: "text-sky-700" };
  }
  if (label === "Calibrating") {
    return { surface: "border-slate-200 bg-slate-50", text: "text-slate-700" };
  }
  return { surface: "border-emerald-200 bg-emerald-50", text: "text-emerald-700" };
}

function signalStrength(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function CaregiverView({
  alerts,
  canvasRef,
  clearAlerts,
  dismissAlert,
  gait,
  gameHistory,
  locationAnalysis,
  locationScenario,
  motionSamples,
  onResetSafeZone,
  onSafeZoneChange,
  onToggleCamera,
  onToggleGeolocation,
  onToggleMotion,
  prewarmVisionRuntime,
  safeZone,
  sensorStatus,
  setView,
  setVoiceSettings,
  videoRef,
  visionMetrics,
  voiceEnabled,
}: CaregiverViewProps) {
  const gaitClasses = gaitRiskClasses(gait.label);

  return (
    <div className="grid gap-5">
      <SectionShell
        eyebrow="Caregiver Command Center"
        title="Operations surface for anomalies, diagnostics, and decline signals"
        description="Live sensor stream + heuristic detectors. Alerts are demo-grade — no clinical scoring."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              icon={<ShieldCheck size={16} />}
              onClick={() => setView("patient")}
            >
              Patient view
            </Button>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <AudioLines size={16} className="text-slate-500" aria-hidden />
              <span className="text-slate-700">Voice guidance</span>
              <Switch
                checked={voiceEnabled}
                onCheckedChange={(checked) =>
                  setVoiceSettings((prev) => ({ ...prev, voiceEnabled: checked }))
                }
                aria-label="Toggle voice guidance"
              />
            </label>
          </div>
        }
      >
        <SensorStatusGrid sensorStatus={sensorStatus} />
        <StatusBoard
          items={[
            {
              label: "GPS source",
              value: sensorLabel(sensorStatus.geo, "Live GPS"),
              tone: sensorTone(sensorStatus.geo),
              detail: `Route profile: ${locationScenario}.`,
            },
            {
              label: "Motion source",
              value: sensorLabel(sensorStatus.motion, "Live motion"),
              tone: sensorTone(sensorStatus.motion),
              detail: `Gait classification: ${gait.label}.`,
            },
            {
              label: "Tracker mode",
              value: trackerLabel(visionMetrics.trackingMode),
              tone: trackerTone(visionMetrics.trackingMode),
              detail:
                visionMetrics.trackingMode === "live-mesh"
                  ? "Ocular landmarks are actively locked."
                  : "Ocular capture is initializing.",
            },
            {
              label: "Face lock",
              value: visionMetrics.faceDetected ? "Locked" : "Aligning",
              tone: faceLockTone(visionMetrics.faceDetected),
              detail: visionMetrics.faceDetected
                ? `${visionMetrics.landmarkCount} landmarks active`
                : "Awaiting stable eye landmarks.",
            },
          ]}
        />
      </SectionShell>

      <SectionShell
        eyebrow="Sensor access"
        title="Live device permissions"
        description="Toggle hardware capture from this surface; the patient view shares the same stream."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <SensorButton
            active={sensorStatus.geo === "live"}
            label={sensorStatus.geo === "live" ? "GPS connected" : "Enable GPS"}
            description="Live geolocation watcher"
            icon={<MapPinned size={18} />}
            onClick={onToggleGeolocation}
          />
          <SensorButton
            active={sensorStatus.motion === "live"}
            label={sensorStatus.motion === "live" ? "Motion connected" : "Enable motion"}
            description="DeviceMotion gait stream"
            icon={<Activity size={18} />}
            onClick={onToggleMotion}
          />
          <div onMouseEnter={() => void prewarmVisionRuntime()} onFocus={() => void prewarmVisionRuntime()}>
            <SensorButton
              active={sensorStatus.camera === "live"}
              label={sensorStatus.camera === "live" ? "Camera active" : "Enable camera"}
              description="Front-camera face mesh"
              icon={<Camera size={18} />}
              onClick={onToggleCamera}
            />
          </div>
        </div>
      </SectionShell>

      <div className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <SectionShell
          eyebrow="Spatial-temporal detection"
          title="Wandering & dwelling anomalies"
        >
          <MapPanel
            analysis={locationAnalysis}
            onResetSafeZone={onResetSafeZone}
            onSafeZoneChange={onSafeZoneChange}
            scenarioLabel={
              locationScenario === "home"
                ? "Home loop"
                : locationScenario === "pacing"
                  ? "Corridor pacing"
                  : "Dwelling outside zone"
            }
            safeZone={safeZone}
          />
        </SectionShell>

        <SectionShell eyebrow="Notification feed" title="Escalations & diagnostic notes">
          <AlertsPanel
            alerts={alerts}
            onClearAll={clearAlerts}
            onDismiss={dismissAlert}
            scrollable
          />
        </SectionShell>
      </div>

      <SectionShell eyebrow="Gait & fall risk" title="Variance-based shuffling and fall analysis">
        <div className="grid gap-5">
          <GaitPanel motionSamples={motionSamples} gait={gait} />
          <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
            <div
              className={`rounded-2xl border p-5 shadow-(--shadow-soft) ${gaitClasses.surface}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Risk summary
              </div>
              <div className={`mt-3 text-4xl font-semibold ${gaitClasses.text}`}>
                {(gait.riskScore * 100).toFixed(0)}%
              </div>
              <div className="mt-1 text-base font-semibold text-slate-900">{gait.label}</div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-400 to-red-500 transition-[width] duration-500"
                  style={{ width: `${Math.max(8, gait.riskScore * 100)}%` }}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Reduced lift, uneven side-to-side sway, weak forward drive, and any sharp impact
                signature all push the risk higher.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:h-full">
              <SignalCard
                label="Vertical oscillation"
                value={gait.zStd.toFixed(2)}
                hint={`Lift concern ${signalStrength(gait.signals.verticalLift)}.`}
              />
              <SignalCard
                label="Lateral asymmetry"
                value={gait.xStd.toFixed(2)}
                hint={`Drift concern ${signalStrength(gait.signals.lateralDrift)}.`}
              />
              <SignalCard
                label="Forward momentum"
                value={gait.yStd.toFixed(2)}
                hint={`Drive concern ${signalStrength(gait.signals.forwardConsistency)}.`}
              />
              <SignalCard
                label="Impact / stillness"
                value={gait.fallDetected ? "Armed" : "Clear"}
                hint={`Spike ${signalStrength(gait.signals.impactSpike)}, stillness ${signalStrength(gait.signals.postImpactStillness)}. Peak ${gait.peakMagnitude.toFixed(2)}g.`}
                emphasis={gait.fallDetected ? "danger" : undefined}
              />
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        eyebrow="Ocular biomarkers"
        title="Live mesh overlay and gaze deviation summary"
      >
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-300 bg-slate-900 shadow-(--shadow-card)">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Live camera feed"
              className="absolute inset-0 h-full w-full object-cover opacity-80"
            />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          </div>
          <StatusBoard
            columns="sm:grid-cols-2"
            items={[
              {
                label: "Tracker mode",
                value: trackerLabel(visionMetrics.trackingMode),
                tone: trackerTone(visionMetrics.trackingMode),
                detail:
                  visionMetrics.trackingMode === "live-mesh"
                    ? "Ocular landmarks actively locked."
                    : "Ocular capture initializing.",
              },
              {
                label: "Face lock",
                value: visionMetrics.faceDetected ? "Locked" : "Aligning",
                tone: faceLockTone(visionMetrics.faceDetected),
                detail: visionMetrics.faceDetected
                  ? `${visionMetrics.landmarkCount} landmarks feeding overlay.`
                  : "Awaiting stable eye landmarks.",
              },
              {
                label: "Ocular risk",
                value: visionMetrics.risk,
                tone: riskTone(visionMetrics.risk),
                detail: `EAR ${visionMetrics.ear.toFixed(2)}, blinks ${visionMetrics.blinkRate.toFixed(1)}/min.`,
              },
              {
                label: "Gaze timing",
                value: `${visionMetrics.fixation}% / ${visionMetrics.latency}ms`,
                tone: "info",
                detail: "Fixation stability and saccadic latency window.",
              },
            ]}
          />
        </div>
      </SectionShell>

      <SectionShell eyebrow="Cognitive assessment" title="Session history and trendline">
        <div className="grid gap-4 xl:grid-cols-[1.55fr_0.45fr]">
          <TrendPanel history={gameHistory} />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
            Session history is persisted in localStorage. Decline alerts are heuristic comparisons
            against the stored baseline, not clinically validated scoring.
          </div>
        </div>
      </SectionShell>
    </div>
  );
}

function SignalCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: "danger";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${emphasis === "danger" ? "text-red-600" : "text-slate-900"}`}
      >
        {value}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{hint}</p>
    </div>
  );
}
