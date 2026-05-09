import { ArrowRight, Brain, Eye, Footprints, MapPinned } from "lucide-react";
import type { ComponentType } from "react";

import AlertsPanel from "../../components/panels/AlertsPanel";
import { Avatar } from "../../components/ui/Avatar";
import SensorStatusGrid from "../../components/ui/SensorStatusGrid";
import StatusBoard from "../../components/ui/StatusBoard";
import { faceLockTone, riskTone, sensorLabel, sensorTone, trackerLabel, trackerTone } from "../../lib/tone";
import { formatMeters } from "../../lib/utils";
import type { PatientProfile } from "../../features/care/types";
import type {
  AppAlert,
  GaitAnalysis,
  GameSession,
  LocationAnalysis,
  SafeZone,
  SensorStatus,
  VisionMetrics,
} from "../../types/app";

type Scene = "overview" | "map" | "alerts" | "gait" | "vision" | "trends" | "manage";

interface OverviewSceneProps {
  profile: PatientProfile;
  alerts: AppAlert[];
  gait: GaitAnalysis;
  gameHistory: GameSession[];
  locationAnalysis: LocationAnalysis;
  locationScenario: string;
  safeZone: SafeZone;
  sensorStatus: SensorStatus;
  visionMetrics: VisionMetrics;
  onNavigate: (scene: Scene) => void;
}

export function OverviewScene({
  profile,
  alerts,
  gait,
  gameHistory,
  locationAnalysis,
  locationScenario,
  safeZone,
  sensorStatus,
  visionMetrics,
  onNavigate,
}: OverviewSceneProps) {
  const lastSession = gameHistory.at(-1);

  return (
    <div className="space-y-6">
      {/* Patient header */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft) sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              name={profile.name}
              src={profile.photo || undefined}
              size="lg"
              hue="cyan"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
                Monitoring
              </p>
              <h1 className="mt-0.5 truncate font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
                {profile.name}
              </h1>
              <p className="text-sm text-slate-600">
                {profile.medicalNotes || "No medical notes recorded"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {alerts.length} active alert{alerts.length === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-slate-500">{profile.homeAddress || "—"}</span>
          </div>
        </div>
      </section>

      <SensorStatusGrid sensorStatus={sensorStatus} />

      {/* Quick metrics with navigation */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PatientMetric
          icon={MapPinned}
          label="Location"
          value={formatMeters(locationAnalysis.currentDistance)}
          context={
            locationAnalysis.outOfBounds
              ? `Outside ${safeZone.name}`
              : `Inside ${safeZone.name}`
          }
          tone={locationAnalysis.outOfBounds ? "warning" : "good"}
          onClick={() => onNavigate("map")}
        />
        <PatientMetric
          icon={Footprints}
          label="Gait"
          value={gait.label}
          context={`${(gait.riskScore * 100).toFixed(0)}% fall risk`}
          tone={
            gait.label === "Fall detected"
              ? "danger"
              : gait.label === "High fall risk"
                ? "warning"
                : "good"
          }
          onClick={() => onNavigate("gait")}
        />
        <PatientMetric
          icon={Eye}
          label="Vision"
          value={visionMetrics.risk}
          context={`${visionMetrics.blinkRate.toFixed(0)} blinks/min`}
          tone={
            visionMetrics.risk === "High"
              ? "danger"
              : visionMetrics.risk === "Moderate"
                ? "warning"
                : "good"
          }
          onClick={() => onNavigate("vision")}
        />
        <PatientMetric
          icon={Brain}
          label="Cognition"
          value={lastSession ? `Span ${lastSession.memorySpan}` : "No data"}
          context={
            lastSession
              ? `${gameHistory.length} session${gameHistory.length === 1 ? "" : "s"} stored`
              : "No sessions yet"
          }
          tone="good"
          onClick={() => onNavigate("trends")}
        />
      </section>

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
                ? "Ocular landmarks actively locked."
                : "Ocular capture initializing.",
          },
          {
            label: "Face lock",
            value: visionMetrics.faceDetected ? "Locked" : "Aligning",
            tone: faceLockTone(visionMetrics.faceDetected),
            detail: visionMetrics.faceDetected
              ? `${visionMetrics.landmarkCount} landmarks active`
              : "Awaiting stable eye landmarks.",
          },
          {
            label: "Ocular risk",
            value: visionMetrics.risk,
            tone: riskTone(visionMetrics.risk),
            detail: `EAR ${visionMetrics.ear.toFixed(2)}, blinks ${visionMetrics.blinkRate.toFixed(1)}/min.`,
          },
          {
            label: "Cognitive trend",
            value: lastSession ? "Tracked" : "Pending",
            tone: lastSession ? "good" : "calm",
            detail: lastSession
              ? `Latest span ${lastSession.memorySpan}, reaction ${Math.round(lastSession.avgReaction)}ms.`
              : "Awaiting first sequence-recall session.",
          },
        ]}
      />

      {/* Recent activity preview */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent activity
          </h2>
          <button
            type="button"
            onClick={() => onNavigate("alerts")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
          >
            See all <ArrowRight size={12} aria-hidden />
          </button>
        </div>
        <AlertsPanel alerts={alerts.slice(0, 4)} />
      </section>
    </div>
  );
}

const TONE_BORDER: Record<"good" | "warning" | "danger", string> = {
  good: "border-slate-200",
  warning: "border-amber-200",
  danger: "border-red-200",
};

const TONE_DOT: Record<"good" | "warning" | "danger", string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

function PatientMetric({
  icon: Icon,
  label,
  value,
  context,
  tone,
  onClick,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  context: string;
  tone: "good" | "warning" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-start gap-2 rounded-2xl border ${TONE_BORDER[tone]} bg-white p-4 text-left shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:shadow-(--shadow-card)`}
    >
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
        {value}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
        {context}
      </div>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 transition group-hover:gap-2">
        Open
        <ArrowRight size={12} />
      </span>
    </button>
  );
}
