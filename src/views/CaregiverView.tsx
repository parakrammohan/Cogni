import type { Dispatch, RefObject, SetStateAction } from "react";
import { Activity, AudioLines, Camera, MapPinned, Shield } from "lucide-react";

import AlertsPanel from "../components/panels/AlertsPanel";
import GaitPanel from "../components/panels/GaitPanel";
import MapPanel from "../components/panels/MapPanel";
import TrendPanel from "../components/panels/TrendPanel";
import SensorStatusGrid from "../components/ui/SensorStatusGrid";
import SectionShell from "../components/ui/SectionShell";
import SensorButton from "../components/ui/SensorButton";
import StatusBoard from "../components/ui/StatusBoard";
import { DarkMetricCard } from "../components/ui/SurfaceCards";
import type {
  AppAlert,
  GameSession,
  GaitAnalysis,
  LocationAnalysis,
  MotionSample,
  SafeZone,
  SensorStatus,
  UserView,
  VisionMetrics,
} from "../types/app";

function gaitRiskTone(label: GaitAnalysis["label"]) {
  if (label === "Fall detected") return "text-signal";
  if (label === "High fall risk") return "text-amber-300";
  if (label === "Irregular") return "text-cyan";
  return "text-emerald-300";
}

function gaitRiskSurface(label: GaitAnalysis["label"]) {
  if (label === "Fall detected") return "border-signal/30 bg-[linear-gradient(160deg,rgba(255,111,77,0.22),rgba(8,17,26,0.9))]";
  if (label === "High fall risk") return "border-amber-300/20 bg-[linear-gradient(160deg,rgba(252,211,77,0.16),rgba(8,17,26,0.9))]";
  if (label === "Irregular") return "border-cyan/25 bg-[linear-gradient(160deg,rgba(109,226,255,0.16),rgba(8,17,26,0.9))]";
  return "border-emerald-300/20 bg-[linear-gradient(160deg,rgba(110,231,183,0.14),rgba(8,17,26,0.9))]";
}

function signalStrength(value: number) {
  return `${Math.round(value * 100)}%`;
}

interface CaregiverViewProps {
  alerts: AppAlert[];
  canvasRef: RefObject<HTMLCanvasElement>;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
  gait: GaitAnalysis;
  gameHistory: GameSession[];
  locationAnalysis: LocationAnalysis;
  locationScenario: string;
  motionSamples: MotionSample[];
  onToggleCamera: () => void;
  onToggleGeolocation: () => void;
  onToggleMotion: () => void;
  onResetSafeZone: () => void;
  onSafeZoneChange: (next: SafeZone) => void;
  prewarmVisionRuntime: () => Promise<void>;
  safeZone: SafeZone;
  sensorStatus: SensorStatus;
  setView: Dispatch<SetStateAction<UserView>>;
  setVoiceSettings: Dispatch<SetStateAction<{ voiceEnabled: boolean }>>;
  videoRef: RefObject<HTMLVideoElement>;
  visionMetrics: VisionMetrics;
  voiceEnabled: boolean;
}

function trackerTone(mode: VisionMetrics["trackingMode"]) {
  if (mode === "live-mesh") return "good";
  if (mode === "camera-search") return "warning";
  return "info";
}

function trackerLabel(mode: VisionMetrics["trackingMode"]) {
  if (mode === "live-mesh") return "Live face mesh";
  if (mode === "camera-search") return "Initializing";
  return "Ready";
}

function sensorTone(status: SensorStatus[keyof SensorStatus]) {
  if (status === "live") return "good";
  if (status === "loading" || status === "requesting") return "warning";
  return "info";
}

function sensorLabel(status: SensorStatus[keyof SensorStatus], liveLabel: string) {
  if (status === "live") return liveLabel;
  if (status === "loading") return "Loading";
  if (status === "requesting") return "Requesting";
  if (status === "offline") return "Standby";
  return "Ready";
}

function riskTone(risk: VisionMetrics["risk"]) {
  if (risk === "High") return "danger";
  if (risk === "Moderate") return "warning";
  return "good";
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
  onToggleCamera,
  onToggleGeolocation,
  onToggleMotion,
  onResetSafeZone,
  onSafeZoneChange,
  prewarmVisionRuntime,
  safeZone,
  sensorStatus,
  setView,
  setVoiceSettings,
  videoRef,
  visionMetrics,
  voiceEnabled,
}: CaregiverViewProps) {
  return (
    <div className="grid gap-6">
      <SectionShell
        eyebrow="Caregiver Command Center"
        title="A clearer operations surface for anomalies, diagnostics, and decline signals."
        description="A live operations surface for anomalies, diagnostics, and cognitive change signals."
        actions={
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setView("patient")}
              className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white"
            >
              <Shield size={18} />
              Return to patient view
            </button>
            <button
              onClick={() =>
                setVoiceSettings((previous) => ({
                  ...previous,
                  voiceEnabled: !previous.voiceEnabled,
                }))
              }
              className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
            >
              <AudioLines size={18} />
              Voice guidance {voiceEnabled ? "on" : "off"}
            </button>
          </div>
        }
      >
        <SensorStatusGrid sensorStatus={sensorStatus} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DarkMetricCard label="Active alerts" value={alerts.length} description="Urgent events are promoted into the command feed." />
          <DarkMetricCard
            label="Location engine"
            value="Geofence model"
            description="Safe-zone checks and dwelling windows run continuously."
          />
          <DarkMetricCard
            label="Motion stream"
            value="Variance analysis"
            description="Shuffling and fall signatures are scored from rolling motion samples."
          />
          <DarkMetricCard
            label="Vision stack"
            value="Mesh + gaze loop"
            description="Camera, runtime, and face lock states are shown below as operator status."
          />
        </div>
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
              detail: `Current gait classification: ${gait.label}.`,
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
              tone: visionMetrics.faceDetected ? "good" : "warning",
              detail: visionMetrics.faceDetected
                ? `${visionMetrics.landmarkCount} landmarks are currently feeding the overlay.`
                : "Awaiting stable eye landmarks.",
            },
          ]}
        />
      </SectionShell>

      <SectionShell eyebrow="Sensor Access" title="Live device permissions and capture controls.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="h-full">
            <SensorButton
              active={sensorStatus.geo === "live"}
              label={sensorStatus.geo === "live" ? "GPS connected" : "Enable GPS"}
              icon={<MapPinned size={18} />}
              onClick={onToggleGeolocation}
            />
          </div>
          <div className="h-full">
            <SensorButton
              active={sensorStatus.motion === "live"}
              label={sensorStatus.motion === "live" ? "Motion connected" : "Enable motion"}
              icon={<Activity size={18} />}
              onClick={onToggleMotion}
            />
          </div>
          <div className="h-full" onMouseEnter={() => void prewarmVisionRuntime()} onFocus={() => void prewarmVisionRuntime()}>
            <SensorButton
              active={sensorStatus.camera === "live"}
              label={sensorStatus.camera === "live" ? "Camera active" : "Enable camera"}
              icon={<Camera size={18} />}
              onClick={onToggleCamera}
            />
          </div>
        </div>
      </SectionShell>

      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <SectionShell eyebrow="Spatial-Temporal Detection" title="Wandering and dwelling anomalies">
          <MapPanel
            analysis={locationAnalysis}
            onResetSafeZone={onResetSafeZone}
            onSafeZoneChange={onSafeZoneChange}
            scenarioLabel={locationScenario === "home" ? "Home loop" : "Dwelling outside zone"}
            safeZone={safeZone}
          />
        </SectionShell>

        <SectionShell eyebrow="Notification Feed" title="Escalations and diagnostic notes">
          <AlertsPanel alerts={alerts} onClearAll={clearAlerts} onDismiss={dismissAlert} scrollable />
        </SectionShell>
      </div>

      <SectionShell eyebrow="Gait & Fall Risk" title="Variance-based shuffling and fall analysis">
        <div className="grid gap-5">
          <GaitPanel motionSamples={motionSamples} gait={gait} />
          <div className="grid gap-4 xl:grid-cols-[0.68fr_1.32fr]">
            <div className={`rounded-[28px] border p-5 ${gaitRiskSurface(gait.label)}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Risk summary</div>
                  <div className={`mt-3 text-4xl font-semibold ${gaitRiskTone(gait.label)}`}>
                    {(gait.riskScore * 100).toFixed(0)}%
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">{gait.label}</div>
                </div>
                <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white">
                  Live classifier
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan via-amber-300 to-signal transition-[width] duration-500"
                  style={{ width: `${Math.max(8, gait.riskScore * 100)}%` }}
                />
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-200">
                This score changes with the actual motion pattern on screen. Reduced lift, uneven side-to-side sway,
                weak forward drive, and any sharp impact signature all push the risk higher.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:h-full">
              <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Vertical oscillation</div>
                <div className="mt-2 text-3xl font-semibold text-white">{gait.zStd.toFixed(2)}</div>
                <p className="mt-2 text-sm text-slate-300">
                  Lift concern {signalStrength(gait.signals.verticalLift)}. Lower up-and-down motion is raising the score.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Lateral asymmetry</div>
                <div className="mt-2 text-3xl font-semibold text-white">{gait.xStd.toFixed(2)}</div>
                <p className="mt-2 text-sm text-slate-300">
                  Drift concern {signalStrength(gait.signals.lateralDrift)}. Uneven side sway is contributing here.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Forward momentum</div>
                <div className="mt-2 text-3xl font-semibold text-white">{gait.yStd.toFixed(2)}</div>
                <p className="mt-2 text-sm text-slate-300">
                  Drive concern {signalStrength(gait.signals.forwardConsistency)}. Forward movement looks less steady.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/6 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Impact / stillness</div>
                <div className={`mt-2 text-3xl font-semibold ${gait.fallDetected ? "text-signal" : "text-white"}`}>
                  {gait.fallDetected ? "Armed" : "Clear"}
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Spike {signalStrength(gait.signals.impactSpike)}, stillness {signalStrength(gait.signals.postImpactStillness)}.
                  Peak {gait.peakMagnitude?.toFixed(2) ?? "0.00"}g, variance {gait.magnitudeStd?.toFixed(2) ?? "0.00"}.
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell eyebrow="Ocular Biomarkers" title="Live camera mesh overlay and gaze deviation summary">
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="relative h-[380px] overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/80">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover opacity-75"
            />
            <canvas ref={canvasRef} width="1280" height="380" className="absolute inset-0 h-full w-full" />
          </div>
          <div className="grid gap-3">
            <StatusBoard
              columns="sm:grid-cols-2"
              items={[
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
                  tone: visionMetrics.faceDetected ? "good" : "warning",
                  detail: visionMetrics.faceDetected
                    ? `${visionMetrics.landmarkCount} landmarks are active.`
                    : "Awaiting stable eye landmarks.",
                },
                {
                  label: "Ocular risk",
                  value: visionMetrics.risk,
                  tone: riskTone(visionMetrics.risk),
                  detail: `Eye aspect ratio ${visionMetrics.ear}.`,
                },
                {
                  label: "Gaze timing",
                  value: "Fixation + latency",
                  tone: "info",
                  detail: (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Fixation</div>
                        <div className="mt-1 text-lg font-semibold text-white">{visionMetrics.fixation}%</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Latency</div>
                        <div className="mt-1 text-lg font-semibold text-white">{visionMetrics.latency}ms</div>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </SectionShell>

      <SectionShell eyebrow="Cognitive Assessment" title="Session history and current trendline">
        <div className="grid gap-4 xl:grid-cols-[1.55fr_0.45fr]">
          <TrendPanel history={gameHistory} />
          <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 text-sm leading-7 text-slate-300">
            Session history is persisted in localStorage. Decline alerts are heuristic comparisons against the
            stored baseline, not clinically validated scoring.
          </div>
        </div>
      </SectionShell>
    </div>
  );
}
