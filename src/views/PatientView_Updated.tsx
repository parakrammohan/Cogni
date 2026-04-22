/**
 * PatientView_Updated.tsx
 * Fixed:
 *  - Consumes visionMetrics from App.tsx props (no duplicate hook)
 *  - irisPosition comes from real iris coordinates via visionMetrics
 *  - Canvas has no hardcoded size (hook manages it)
 *  - block/hidden tab switching keeps videoRef alive in DOM
 */

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
  Target,
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
} from "../types/app";
import type { OcularMetrics } from "../hooks/useOcularTracking";

import SmoothPursuitTest from "../components/SmoothPursuitTest";

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
  voiceEnabled: boolean;
  /** Passed down from App — do NOT re-create the hook here */
  visionMetrics: OcularMetrics;
}

const TABS = [
  { id: "overview",   label: "Dashboard",        icon: LayoutDashboard },
  { id: "ocular",     label: "Ocular Screening",  icon: Eye            },
  { id: "pursuit",    label: "Pursuit Test",       icon: Target         },
  { id: "cognitive",  label: "Cognitive Module",   icon: Brain          },
] as const;

type TabId = (typeof TABS)[number]["id"];

function riskTone(risk: OcularMetrics["risk"]) {
  if (risk === "High")     return "danger";
  if (risk === "Moderate") return "warning";
  return "good";
}

function faceLockLabel(detected: boolean) {
  return detected ? "Face locked" : "Aligning";
}
function faceLockTone(detected: boolean) {
  return detected ? "good" : "warning";
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
  voiceEnabled,
  visionMetrics,
}: PatientViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [pursuitTestResult, setPursuitTestResult] = useState<any>(null);

  // Real iris position from the hook — no more Math.random() jitter
  const irisPosition = visionMetrics.irisPosition ?? null;

  return (
    <div className="flex flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/50 shadow-sm">

      {/* ── Header: tabs + status badges ─────────────────────────────────── */}
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

        <div className="flex flex-shrink-0 items-center gap-3 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
          <Badge tone={riskTone(visionMetrics.risk)}>
            Eye screening: {visionMetrics.risk} risk
          </Badge>
          <Badge tone={locationAnalysis.outOfBounds ? "danger" : "good"}>
            {locationAnalysis.outOfBounds ? "Safe-zone breach" : "Safe zone stable"}
          </Badge>
        </div>
      </div>

      {/* ── Global sensor bar ──────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-slate-100/50 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SensorButton
            active={sensorStatus.geo === "live"}
            tone="light"
            label={sensorStatus.geo === "live" ? "GPS connected" : "Enable GPS"}
            icon={<MapPinned size={18} />}
            onClick={onToggleGeolocation}
          />
          <SensorButton
            active={sensorStatus.motion === "live"}
            tone="light"
            label={sensorStatus.motion === "live" ? "Motion connected" : "Enable motion"}
            icon={<Activity size={18} />}
            onClick={onToggleMotion}
          />
          <div
            onMouseEnter={() => void prewarmVisionRuntime()}
            onFocus={() => void prewarmVisionRuntime()}
          >
            <SensorButton
              active={sensorStatus.camera === "live"}
              tone="light"
              label={sensorStatus.camera === "live" ? "Camera active" : "Enable camera"}
              icon={<Camera size={18} />}
              onClick={onToggleCamera}
            />
          </div>
        </div>
      </div>

      {/* ── Tab content — block/hidden so videoRef is NEVER unmounted ─────── */}
      <div className="min-h-[600px] bg-slate-50/30 p-4 sm:p-6 lg:p-8">

        {/* ── TAB 1: Overview ─────────────────────────────────────────────── */}
        <div className={activeTab === "overview" ? "block animate-in fade-in slide-in-from-bottom-2 duration-300" : "hidden"}>
          <div className="grid gap-6">
            <SectionShell
              light
              eyebrow="Patient Interface"
              title="Live Patient Dashboard"
              description={`CogniTrack with real-time AI-powered dementia screening. ${patientStatus}`}
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
                  value={`${visionMetrics.risk} risk`}
                  description={`Blink rate: ${visionMetrics.blinkRate}/min | EAR: ${visionMetrics.ear} | Fixation: ${visionMetrics.fixation}%`}
                />
              </div>

              <div className="mt-4 rounded-[20px] border border-blue-200 bg-blue-50/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-blue-500 p-2">
                    <Brain size={20} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-900">AI Analysis Active</h4>
                    <p className="mt-1 text-sm text-blue-700">
                      {visionMetrics.faceDetected ? (
                        <>
                          Tracking{" "}
                          <strong>{visionMetrics.landmarkCount} facial landmarks</strong>{" "}
                          in real-time. Blink pattern shows{" "}
                          <strong>{visionMetrics.risk.toLowerCase()} risk</strong>{" "}
                          indicators.
                        </>
                      ) : (
                        "Enable camera in the sensor bar above to start AI-powered ocular screening."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </SectionShell>
          </div>
        </div>

        {/* ── TAB 2: Ocular Screening ──────────────────────────────────────── */}
        <div className={activeTab === "ocular" ? "block animate-in fade-in slide-in-from-bottom-2 duration-300" : "hidden"}>
          <SectionShell
            light
            eyebrow="Ocular Biomarkers"
            title="AI-Powered Blink Pattern Analysis"
            description="Real-time dementia screening using Eye Aspect Ratio (EAR) and blink frequency analysis."
          >
            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr] xl:items-start">
              {/* Video + canvas overlay */}
              <div className="grid gap-4">
                <div className="relative overflow-hidden rounded-[26px] border border-slate-300 bg-black"
                     style={{ aspectRatio: "16/9" }}>

                  {/*
                    IMPORTANT: video + canvas are ALWAYS in the DOM.
                    They are hidden via CSS when not on this tab, not unmounted.
                    The hook keeps the detection loop running regardless of tab.
                  */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover opacity-80"
                  />
                  {/*
                    No width/height attributes here — the hook sets canvas pixel
                    dimensions to match videoWidth/videoHeight dynamically.
                  */}
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 h-full w-full"
                  />

                  {/* Overlay status when camera is off */}
                  {sensorStatus.camera !== "live" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/80">
                      <Camera size={32} className="text-slate-400" />
                      <p className="text-sm text-slate-300">Enable camera to start eye tracking</p>
                    </div>
                  )}

                  {/* Live metric chips */}
                  {visionMetrics.faceDetected && (
                    <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                      {[
                        { label: "EAR",        value: visionMetrics.ear.toString() },
                        { label: "Blinks/min", value: visionMetrics.blinkRate.toString() },
                        {
                          label: "Risk",
                          value: visionMetrics.risk,
                          colour:
                            visionMetrics.risk === "High"     ? "text-red-400" :
                            visionMetrics.risk === "Moderate" ? "text-yellow-400" :
                                                                "text-green-400",
                        },
                      ].map((chip) => (
                        <div
                          key={chip.label}
                          className="flex-1 rounded-lg bg-black/70 px-3 py-2 text-xs text-white backdrop-blur"
                        >
                          <div className="font-semibold">{chip.label}</div>
                          <div className={`text-xl font-bold ${chip.colour ?? ""}`}>
                            {chip.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats panel */}
              <div className="grid gap-3">
                <StatusBoard
                  light
                  columns="sm:grid-cols-2"
                  items={[
                    {
                      label:  "Face lock",
                      value:  faceLockLabel(visionMetrics.faceDetected),
                      tone:   faceLockTone(visionMetrics.faceDetected),
                      detail: visionMetrics.faceDetected ? "Tracking active" : "Align face to camera",
                    },
                    {
                      label:  "Dementia risk",
                      value:  visionMetrics.risk,
                      tone:   riskTone(visionMetrics.risk),
                      detail: `Blinks: ${visionMetrics.blinkRate}/min`,
                    },
                  ]}
                />
                <InfoStat label="Average EAR"      value={visionMetrics.ear.toString()} />
                {/* <InfoStat label="Left EAR"         value={visionMetrics.leftEAR.toString()} />
                <InfoStat label="Right EAR"        value={visionMetrics.rightEAR.toString()} /> */}
                <InfoStat label="Fixation quality" value={`${visionMetrics.fixation}%`} />
                <InfoStat label="Landmarks"        value={visionMetrics.landmarkCount.toString()} />
                <InfoStat label="Tracking mode"    value={visionMetrics.trackingMode} />

                {/* Blink rate indicator */}
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Blink rate</span>
                    <span className="font-semibold text-slate-800">{visionMetrics.blinkRate}/min</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        visionMetrics.blinkRate >= 10 && visionMetrics.blinkRate <= 20
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min((visionMetrics.blinkRate / 30) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>0</span>
                    <span className="text-green-600">Normal 10–20</span>
                    <span>30+</span>
                  </div>
                </div>
              </div>
            </div>
          </SectionShell>
        </div>

        {/* ── TAB 3: Smooth Pursuit Test ───────────────────────────────────── */}
        <div className={activeTab === "pursuit" ? "block animate-in fade-in slide-in-from-bottom-2 duration-300" : "hidden"}>
          <SectionShell
            light
            eyebrow="Eye Movement Assessment"
            title="Smooth Pursuit Test"
            description="Follow the moving target with your eyes to assess oculomotor smoothness."
          >
            <SmoothPursuitTest
              onTestComplete={setPursuitTestResult}
              irisPosition={irisPosition}   // real coordinates, not random
              testDuration={15}
            />
            {pursuitTestResult && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <MetricCard
                  icon={<Target size={20} />}
                  label="Smoothness"
                  value={`${pursuitTestResult.smoothness}%`}
                  description="Tracking consistency (higher = better)"
                />
                <MetricCard
                  icon={<Target size={20} />}
                  label="Latency"
                  value={`${pursuitTestResult.latency}ms`}
                  description="Average gaze reaction time"
                />
              </div>
            )}
          </SectionShell>
        </div>

        {/* ── TAB 4: Cognitive Module ──────────────────────────────────────── */}
        <div className={activeTab === "cognitive" ? "block animate-in fade-in slide-in-from-bottom-2 duration-300" : "hidden"}>
          <SectionShell
            light
            eyebrow="Cognitive Module"
            title="Evidence-informed cognitive exercises with persisted baselines."
          >
            <MemoryGame onSessionRecorded={handleSessionRecorded} voiceEnabled={voiceEnabled} />
          </SectionShell>
        </div>

      </div>
    </div>
  );
}
