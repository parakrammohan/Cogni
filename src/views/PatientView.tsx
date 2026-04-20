import type { RefObject } from "react";
import { Camera, Crosshair, Footprints, MapPinned, Activity } from "lucide-react";

import AlertsPanel from "../components/panels/AlertsPanel";
import MemoryGame from "../components/panels/MemoryGame";
import Badge from "../components/ui/Badge";
import SectionShell from "../components/ui/SectionShell";
import SensorButton from "../components/ui/SensorButton";
import SensorStatusGrid from "../components/ui/SensorStatusGrid";
import StatusBoard from "../components/ui/StatusBoard";
import { InfoStat, MetricCard } from "../components/ui/SurfaceCards";
import { formatMeters } from "../lib/utils";
import type {
  AppAlert,
  GameSession,
  GaitAnalysis,
  LocationAnalysis,
  SafeZone,
  SensorStatus,
  VisionMetrics,
} from "../types/app";

interface PatientViewProps {
  alerts: AppAlert[];
  gait: GaitAnalysis;
  handleSessionRecorded: (session: GameSession) => void;
  locationAnalysis: LocationAnalysis;
  onToggleCamera: () => void;
  onToggleGeolocation: () => void;
  onToggleMotion: () => void;
  patientStatus: string;
  prewarmVisionRuntime: () => Promise<void>;
  safeZone: SafeZone;
  sensorStatus: SensorStatus;
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
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

function faceLockTone(faceDetected: boolean) {
  return faceDetected ? "good" : "warning";
}

function faceLockLabel(faceDetected: boolean) {
  return faceDetected ? "Face locked" : "Aligning";
}

function riskTone(risk: VisionMetrics["risk"]) {
  if (risk === "High") return "danger";
  if (risk === "Moderate") return "warning";
  return "good";
}

export default function PatientView({
  alerts,
  gait,
  handleSessionRecorded,
  locationAnalysis,
  onToggleCamera,
  onToggleGeolocation,
  onToggleMotion,
  patientStatus,
  prewarmVisionRuntime,
  safeZone,
  sensorStatus,
  videoRef,
  canvasRef,
  visionMetrics,
  voiceEnabled,
}: PatientViewProps) {
  return (
    <div className="grid gap-6">
      <SectionShell
        light
        eyebrow="Patient Interface"
        title="A calmer surface for guided checks, therapy loops, and safety reassurance."
        description={`CogniTrack keeps the patient flow readable and low-friction while still exposing live sensor handoff when the device allows it. ${patientStatus}`}
        actions={
          <div className="flex flex-wrap gap-3">
            <Badge tone={locationAnalysis.outOfBounds ? "danger" : "good"}>
              {locationAnalysis.outOfBounds ? "Safe-zone breach" : "Safe zone stable"}
            </Badge>
            <Badge
              tone={
                gait.label === "Normal"
                  ? "good"
                  : gait.label === "Fall detected"
                    ? "danger"
                    : "warning"
              }
            >
              {gait.label}
            </Badge>
          </div>
        }
      >
        <SensorStatusGrid sensorStatus={sensorStatus} light />
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            icon={<MapPinned size={20} />}
            label="Route watch"
            value={formatMeters(locationAnalysis.currentDistance)}
            description={`Distance from ${safeZone.name}. Wandering and prolonged dwelling are evaluated continuously in the background.`}
          />
          <MetricCard
            icon={<Footprints size={20} />}
            label="Gait status"
            value={gait.label}
            description={`Current fall-risk confidence ${(gait.riskScore * 100).toFixed(0)}%. Stability is reviewed continuously during active monitoring.`}
          />
          <MetricCard
            icon={<Crosshair size={20} />}
            label="Eye screening"
            value={`${visionMetrics.fixation}%`}
            description="Moving-target gaze guidance with live face mesh and ocular response scoring."
          />
        </div>
      </SectionShell>

      <SectionShell
        light
        eyebrow="Sensor Access"
        title="Live device permissions and capture controls."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="h-full">
            <SensorButton
              active={sensorStatus.geo === "live"}
              tone="light"
              label={sensorStatus.geo === "live" ? "GPS connected" : "Enable GPS"}
              icon={<MapPinned size={18} />}
              onClick={onToggleGeolocation}
            />
          </div>
          <div className="h-full">
            <SensorButton
              active={sensorStatus.motion === "live"}
              tone="light"
              label={sensorStatus.motion === "live" ? "Motion connected" : "Enable motion"}
              icon={<Activity size={18} />}
              onClick={onToggleMotion}
            />
          </div>
          <div className="h-full" onMouseEnter={() => void prewarmVisionRuntime()} onFocus={() => void prewarmVisionRuntime()}>
            <SensorButton
              active={sensorStatus.camera === "live"}
              tone="light"
              label={sensorStatus.camera === "live" ? "Camera active" : "Enable camera"}
              icon={<Camera size={18} />}
              onClick={onToggleCamera}
            />
          </div>
        </div>
      </SectionShell>

      <SectionShell
        light
        eyebrow="Ocular Biomarkers"
        title="Front-camera screening with guided live ocular capture."
      >
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr] xl:items-start">
          <div className="grid gap-4">
            <div className="relative h-[340px] overflow-hidden rounded-[26px] border border-slate-300 bg-ink">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover opacity-75"
              />
              <canvas ref={canvasRef} width="960" height="340" className="absolute inset-0 h-full w-full" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-[24px] bg-slate-100 p-4 text-sm leading-6 text-slate-600">
                Live ocular capture is confirmed when this panel shows <strong>Live face mesh</strong>. Keep the face
                centered and evenly lit for the fastest lock.
              </div>
              <div className="rounded-[24px] border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600">
                The camera surface is tuned for a forward-facing portrait view with a centered head position and stable
                ambient light.
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <StatusBoard
              light
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
                  value: faceLockLabel(visionMetrics.faceDetected),
                  tone: faceLockTone(visionMetrics.faceDetected),
                  detail: visionMetrics.faceDetected
                    ? `${visionMetrics.landmarkCount} eye and iris landmarks are active.`
                    : "Align face centrally in the capture window.",
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
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fixation</div>
                        <div className="mt-1 text-lg font-semibold text-ink">{visionMetrics.fixation}%</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Latency</div>
                        <div className="mt-1 text-lg font-semibold text-ink">{visionMetrics.latency}ms</div>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
            <InfoStat label="Eye aspect ratio" value={visionMetrics.ear} />
          </div>
        </div>
      </SectionShell>

      <SectionShell
        light
        eyebrow="Cognitive Module"
        title="Evidence-informed cognitive exercises with persisted baselines."
      >
        <MemoryGame onSessionRecorded={handleSessionRecorded} voiceEnabled={voiceEnabled} />
      </SectionShell>

      <SectionShell light eyebrow="Recent Feed" title="What the caregiver dashboard is currently seeing.">
        <AlertsPanel alerts={alerts.slice(0, 4)} light />
      </SectionShell>
    </div>
  );
}
