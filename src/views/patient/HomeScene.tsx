import { ArrowRight, Brain, Eye, Footprints, MapPinned, Target } from "lucide-react";
import type { ComponentType } from "react";

import AlertsPanel from "../../components/panels/AlertsPanel";
import { cx, formatMeters } from "../../lib/utils";
import type {
  AppAlert,
  GaitAnalysis,
  LocationAnalysis,
  SafeZone,
  VisionMetrics,
} from "../../types/app";

type Scene = "home" | "ocular" | "pursuit" | "cognitive";

interface HomeSceneProps {
  alerts: AppAlert[];
  gait: GaitAnalysis;
  locationAnalysis: LocationAnalysis;
  safeZone: SafeZone;
  visionMetrics: VisionMetrics;
  patientStatus: string;
  onNavigate: (scene: Scene) => void;
}

export function HomeScene({
  alerts,
  gait,
  locationAnalysis,
  safeZone,
  visionMetrics,
  patientStatus,
  onNavigate,
}: HomeSceneProps) {
  const greeting = greetingForTime(new Date());
  const tone = chooseTone({ locationAnalysis, gait, visionMetrics });

  return (
    <div className="space-y-5">
      {/* Hero — greeting + status */}
      <section
        className={cx(
          "relative overflow-hidden rounded-3xl px-6 py-8 sm:px-8 sm:py-10",
          tone.surface,
        )}
      >
        <div className={cx("absolute inset-0 opacity-70", tone.glow)} aria-hidden />
        <div className="relative">
          <p className={cx("text-sm font-medium", tone.eyebrow)}>{greeting}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            {patientStatus}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-700 sm:text-base">
            Three things you can do right now to keep tabs on your health. Each takes about a
            minute.
          </p>
        </div>
      </section>

      {/* Quick metrics */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric
          icon={MapPinned}
          label="Distance from home"
          value={formatMeters(locationAnalysis.currentDistance)}
          status={
            locationAnalysis.outOfBounds
              ? `Outside ${safeZone.name}`
              : `Inside ${safeZone.name}`
          }
          tone={locationAnalysis.outOfBounds ? "warning" : "good"}
        />
        <Metric
          icon={Footprints}
          label="Walking"
          value={gait.label}
          status={`${(gait.riskScore * 100).toFixed(0)}% fall risk`}
          tone={
            gait.label === "Fall detected"
              ? "danger"
              : gait.label === "High fall risk"
                ? "warning"
                : "good"
          }
        />
        <Metric
          icon={Eye}
          label="Eye health"
          value={`${visionMetrics.risk} risk`}
          status={`Blinks ${visionMetrics.blinkRate.toFixed(0)}/min`}
          tone={
            visionMetrics.risk === "High"
              ? "danger"
              : visionMetrics.risk === "Moderate"
                ? "warning"
                : "good"
          }
        />
      </section>

      {/* Action tiles */}
      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Today&apos;s checks
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionTile
            icon={Eye}
            title="Eye check"
            blurb="Camera-based blink and gaze analysis."
            duration="1 min"
            onClick={() => onNavigate("ocular")}
          />
          <ActionTile
            icon={Target}
            title="Pursuit test"
            blurb="Follow a moving target with your eyes."
            duration="15 sec"
            onClick={() => onNavigate("pursuit")}
          />
          <ActionTile
            icon={Brain}
            title="Memory game"
            blurb="Sequence recall to log a baseline."
            duration="2 min"
            onClick={() => onNavigate("cognitive")}
          />
        </div>
      </section>

      {/* Recent activity */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent activity
          </h2>
          <span className="text-xs text-slate-400">
            {alerts.length === 0 ? "No alerts" : `${alerts.length} total`}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
          {alerts.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">
              You&apos;re all clear. Anomaly notifications appear here as they happen.
            </p>
          ) : (
            <AlertsPanel alerts={alerts.slice(0, 3)} />
          )}
        </div>
      </section>
    </div>
  );
}

interface MetricProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  status: string;
  tone: "good" | "warning" | "danger";
}

const TONE_DOT: Record<MetricProps["tone"], string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

function Metric({ icon: Icon, label, value, status, tone }: MetricProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
        {value}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        <span className={cx("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
        {status}
      </div>
    </div>
  );
}

interface ActionTileProps {
  icon: ComponentType<{ size?: number }>;
  title: string;
  blurb: string;
  duration: string;
  onClick: () => void;
}

function ActionTile({ icon: Icon, title, blurb, duration, onClick }: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-(--shadow-card) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <Icon size={20} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {duration}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-slate-600">{blurb}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cyan-700 transition group-hover:gap-2">
        Start
        <ArrowRight size={14} />
      </span>
    </button>
  );
}

function greetingForTime(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return "Late night check-in";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Late night check-in";
}

interface ToneInputs {
  locationAnalysis: LocationAnalysis;
  gait: GaitAnalysis;
  visionMetrics: VisionMetrics;
}

function chooseTone({ locationAnalysis, gait, visionMetrics }: ToneInputs) {
  const danger =
    locationAnalysis.outOfBounds ||
    gait.label === "Fall detected" ||
    visionMetrics.risk === "High";
  const warning = gait.label === "High fall risk" || visionMetrics.risk === "Moderate";

  if (danger) {
    return {
      surface: "bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 border border-red-100",
      glow:
        "bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.18),transparent_60%)]",
      eyebrow: "text-red-700",
    };
  }
  if (warning) {
    return {
      surface: "bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border border-amber-100",
      glow:
        "bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_60%)]",
      eyebrow: "text-amber-700",
    };
  }
  return {
    surface: "bg-gradient-to-br from-cyan-50 via-sky-50 to-emerald-50 border border-cyan-100",
    glow:
      "bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.20),transparent_60%)]",
    eyebrow: "text-cyan-700",
  };
}
