import { useState, type RefObject } from "react";
import {
  Activity,
  Brain,
  Camera,
  Crosshair,
  Eye,
  Footprints,
  LayoutDashboard,
  MapPinned,
  Sparkles,
  Target,
} from "lucide-react";

import SmoothPursuitTest from "../components/SmoothPursuitTest";
import AlertsPanel from "../components/panels/AlertsPanel";
import MemoryGame from "../components/panels/MemoryGame";
import Badge from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import SectionShell from "../components/ui/SectionShell";
import SensorButton from "../components/ui/SensorButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { InfoStat, MetricCard } from "../components/ui/SurfaceCards";
import { riskTone } from "../lib/tone";
import { formatMeters } from "../lib/utils";
import type {
  AppAlert,
  GaitAnalysis,
  GameSession,
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
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  visionMetrics: VisionMetrics;
  voiceEnabled: boolean;
}

const TABS = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "ocular", label: "Ocular screening", icon: Eye },
  { id: "pursuit", label: "Pursuit test", icon: Target },
  { id: "cognitive", label: "Cognitive games", icon: Brain },
] as const;

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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [pursuitResult, setPursuitResult] = useState<{
    smoothness: number;
    latency: number;
  } | null>(null);

  return (
    <div className="grid gap-5">
      {/* Sensor toolbar */}
      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft) sm:grid-cols-3">
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Patient sections">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} icon={<Icon size={16} />}>
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div className="flex items-center gap-2">
            <Badge tone={locationAnalysis.outOfBounds ? "danger" : "good"}>
              {locationAnalysis.outOfBounds ? "Safe-zone breach" : "Safe zone stable"}
            </Badge>
            <Badge tone={riskTone(visionMetrics.risk)}>Eye {visionMetrics.risk}</Badge>
          </div>
        </div>

        <TabsContent value="overview">
          <SectionShell
            eyebrow="Patient Interface"
            title="Live overview"
            description={`CogniTrack in real time. ${patientStatus}`}
          >
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
                description={`Current fall-risk confidence ${(gait.riskScore * 100).toFixed(0)}%.`}
              />
              <MetricCard
                icon={<Crosshair size={20} />}
                label="Eye screening"
                value={`${visionMetrics.risk} risk`}
                description={`Blinks/min ${visionMetrics.blinkRate.toFixed(1)} · EAR ${visionMetrics.ear.toFixed(2)} · Fixation ${visionMetrics.fixation}%`}
              />
            </div>

            <AnalysisBanner faceDetected={visionMetrics.faceDetected} risk={visionMetrics.risk} landmarks={visionMetrics.landmarkCount} />

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Recent activity</h3>
                <p className="mt-1 text-xs text-slate-500">
                  The last few notifications shown to your caregiver.
                </p>
                <div className="mt-3">
                  <AlertsPanel alerts={alerts.slice(0, 3)} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">What to try next</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <Target size={14} className="mt-1 text-cyan-700" aria-hidden />
                    Run the pursuit test for a 15-second eye-movement reading.
                  </li>
                  <li className="flex items-start gap-2">
                    <Brain size={14} className="mt-1 text-cyan-700" aria-hidden />
                    Play the sequence game to log a cognitive baseline.
                  </li>
                  <li className="flex items-start gap-2">
                    <Camera size={14} className="mt-1 text-cyan-700" aria-hidden />
                    Enable the camera to unlock real face-mesh metrics.
                  </li>
                </ul>
              </div>
            </div>
          </SectionShell>
        </TabsContent>

        <TabsContent value="ocular">
          <SectionShell
            eyebrow="Ocular biomarkers"
            title="Front-camera screening"
            description="Real-time eye aspect ratio, blink rate, and iris tracking via MediaPipe Face Mesh."
          >
            <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr] xl:items-start">
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-300 bg-black shadow-(--shadow-card)">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label="Live camera feed for ocular screening"
                  className="absolute inset-0 h-full w-full object-cover opacity-80"
                />
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                {sensorStatus.camera !== "live" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/85 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                      <Camera size={24} aria-hidden />
                    </div>
                    <p className="max-w-xs text-sm text-slate-200">
                      Enable the camera to start AI-powered ocular screening.
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={onToggleCamera}
                      icon={<Camera size={14} />}
                    >
                      Enable camera
                    </Button>
                  </div>
                ) : null}
                {visionMetrics.faceDetected ? (
                  <div className="absolute bottom-3 left-3 right-3 grid grid-cols-3 gap-2">
                    <Chip label="EAR" value={visionMetrics.ear.toFixed(2)} />
                    <Chip label="Blinks/min" value={visionMetrics.blinkRate.toFixed(1)} />
                    <Chip
                      label="Risk"
                      value={visionMetrics.risk}
                      accent={
                        visionMetrics.risk === "High"
                          ? "text-red-400"
                          : visionMetrics.risk === "Moderate"
                            ? "text-amber-300"
                            : "text-emerald-400"
                      }
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3">
                <InfoStat label="Average EAR" value={visionMetrics.ear.toFixed(2)} />
                <InfoStat label="Fixation quality" value={`${visionMetrics.fixation}%`} />
                <InfoStat label="Landmarks" value={visionMetrics.landmarkCount.toString()} />
                <BlinkMeter rate={visionMetrics.blinkRate} />
              </div>
            </div>
          </SectionShell>
        </TabsContent>

        <TabsContent value="pursuit">
          <SectionShell
            eyebrow="Eye-movement assessment"
            title="Smooth pursuit test"
            description="Follow a moving target with your eyes — we score smoothness, latency, accuracy."
          >
            <SmoothPursuitTest
              onTestComplete={(result) =>
                setPursuitResult({ smoothness: result.smoothness, latency: result.latency })
              }
              irisPosition={visionMetrics.irisPosition}
              testDuration={15}
            />
            {pursuitResult ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  icon={<Target size={20} />}
                  label="Smoothness"
                  value={`${pursuitResult.smoothness}%`}
                  description="Higher is better — measures velocity consistency along the target path."
                />
                <MetricCard
                  icon={<Activity size={20} />}
                  label="Latency"
                  value={`${pursuitResult.latency}ms`}
                  description="Average response delay when the target changes direction."
                />
              </div>
            ) : null}
          </SectionShell>
        </TabsContent>

        <TabsContent value="cognitive">
          <SectionShell
            eyebrow="Cognitive module"
            title="Working memory, reasoning, and processing speed"
            description="Three short games map to domains commonly targeted in older-adult cognitive training."
          >
            <MemoryGame onSessionRecorded={handleSessionRecorded} voiceEnabled={voiceEnabled} />
          </SectionShell>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AnalysisBanner({
  faceDetected,
  risk,
  landmarks,
}: {
  faceDetected: boolean;
  risk: VisionMetrics["risk"];
  landmarks: number;
}) {
  if (!faceDetected) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="rounded-full bg-slate-200 p-2 text-slate-600">
          <Sparkles size={18} aria-hidden />
        </div>
        <div className="text-sm text-slate-700">
          <strong>AI screening is on standby.</strong> Enable the camera in the sensor bar above to
          start ocular analysis.
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
      <div className="rounded-full bg-cyan-600 p-2 text-white">
        <Sparkles size={18} aria-hidden />
      </div>
      <div className="text-sm text-cyan-900">
        <strong>AI analysis active.</strong> Tracking <strong>{landmarks}</strong> facial landmarks
        in real time. Blink pattern indicates <strong>{risk.toLowerCase()}</strong> risk.
      </div>
    </div>
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-black/70 px-3 py-2 text-xs text-white backdrop-blur">
      <div className="font-semibold opacity-80">{label}</div>
      <div className={`text-lg font-bold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function BlinkMeter({ rate }: { rate: number }) {
  const isNormal = rate >= 10 && rate <= 20;
  const widthPct = Math.min((rate / 30) * 100, 100);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider">Blink rate</span>
        <span className="font-semibold text-slate-800">{rate.toFixed(1)}/min</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            isNormal ? "bg-emerald-500" : "bg-amber-500"
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>0</span>
        <span className="text-emerald-700">Normal 10–20</span>
        <span>30+</span>
      </div>
    </div>
  );
}
