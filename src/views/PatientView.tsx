import { useState, type RefObject } from "react";
import { 
  Camera, 
  Crosshair, 
  Footprints, 
  MapPinned, 
  Activity,
  LayoutDashboard,
  Eye,
  Brain,
  Radio
} from "lucide-react";

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

const TABS =[
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "ocular", label: "Ocular Screening", icon: Eye },
  { id: "cognitive", label: "Cognitive Module", icon: Brain },
  { id: "sensors", label: "Device Sensors", icon: Radio },
] as const;

type TabId = (typeof TABS)[number]["id"];

// --- Helper Functions ---

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
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="flex flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/50 shadow-sm">
      
      {/* Browser-like Toolbar & Tab Navigation */}
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex space-x-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Global Status Indicators (Acts like browser extensions area) */}
        <div className="flex flex-shrink-0 items-center gap-3 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
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
      </div>

      {/* Browser Viewport / Tab Content Area */}
      <div className="p-4 sm:p-6 lg:p-8 min-h-[600px] bg-slate-50/30">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="grid gap-6">
              <SectionShell
                light
                eyebrow="Patient Interface"
                title="Live Patient Dashboard"
                description={`CogniTrack keeps the patient flow readable and low-friction. ${patientStatus}`}
              >
                <SensorStatusGrid sensorStatus={sensorStatus} light />
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    icon={<MapPinned size={20} />}
                    label="Route watch"
                    value={formatMeters(locationAnalysis.currentDistance)}
                    description={`Distance from ${safeZone.name}. Wandering and prolonged dwelling are evaluated continuously.`}
                  />
                  <MetricCard
                    icon={<Footprints size={20} />}
                    label="Gait status"
                    value={gait.label}
                    description={`Current fall-risk confidence ${(gait.riskScore * 100).toFixed(0)}%. Stability is reviewed continuously.`}
                  />
                  <MetricCard
                    icon={<Crosshair size={20} />}
                    label="Eye screening"
                    value={`${visionMetrics.fixation}%`}
                    description="Moving-target gaze guidance with live face mesh and ocular response scoring."
                  />
                </div>
              </SectionShell>
            </div>
          )}

          {/* TAB 2: OCULAR SCREENING */}
          {activeTab === "ocular" && (
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
          )}

          {/* TAB 3: COGNITIVE MODULE */}
          {activeTab === "cognitive" && (
            <SectionShell
              light
              eyebrow="Cognitive Module"
              title="Evidence-informed cognitive exercises with persisted baselines."
            >
              <MemoryGame onSessionRecorded={handleSessionRecorded} voiceEnabled={voiceEnabled} />
            </SectionShell>
          )}

          {/* TAB 4: SENSORS */}
          {activeTab === "sensors" && (
            <SectionShell
              light
              eyebrow="Sensor Access"
              title="Live device permissions and capture controls."
              description="Manually handoff and toggle hardware access logic directly when the device permits it."
            >
              <div className="grid gap-4 md:grid-cols-3">
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
          )}

        </div>
      </div>
    </div>
  );
}