import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  History,
  Sparkles,
  Target as TargetIcon,
} from "lucide-react";
import type { RefObject } from "react";

import StatusBoard from "../../components/ui/StatusBoard";
import { faceLockTone, riskTone, trackerLabel, trackerTone } from "../../lib/tone";
import type { StoredPursuitResult } from "../../features/vision/pursuit-analysis";
import type { VisionMetrics } from "../../features/vision/types";
import { cx, relativeTime } from "../../lib/utils";

interface VisionSceneProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  visionMetrics: VisionMetrics;
  pursuitHistory: ReadonlyArray<StoredPursuitResult>;
}

/**
 * Caregiver "Ocular biomarkers" surface.
 *
 * Layout:
 *   1) Hero — patient's current ocular risk + a single-sentence summary
 *      drawn from the live mesh and pursuit history.
 *   2) Live section — full mesh viewport on the left, biomarker StatusBoard
 *      on the right.
 *   3) Pursuit section — latest result tiles, recent-runs sparkline of
 *      pursuit gain (the most discriminating clinical metric), and a
 *      sessions list.
 *
 * No scrolling required to see "is the patient OK right now?" — the hero
 * + live row fit in a desktop viewport.
 */
export function VisionScene({
  videoRef,
  canvasRef,
  visionMetrics,
  pursuitHistory,
}: VisionSceneProps) {
  const latest = pursuitHistory.at(-1) ?? null;
  const history = pursuitHistory.slice(-10);
  const summary = summarize({ visionMetrics, pursuitHistory });

  return (
    <div className="space-y-5">
      <Hero summary={summary} />

      {/* Live mesh + biomarkers */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
          <div className="mb-3 flex items-center gap-2 px-2 pt-1">
            <Activity size={14} className="text-cyan-700" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
              Live mesh
            </span>
            <span className="ml-auto text-xs text-slate-500">
              {visionMetrics.faceDetected ? "Face locked" : "No face"}
            </span>
          </div>
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
        </div>
        <div className="grid gap-3">
          <StatusBoard
            columns="grid-cols-2"
            items={[
              {
                label: "Tracker",
                value: trackerLabel(visionMetrics.trackingMode),
                tone: trackerTone(visionMetrics.trackingMode),
                detail:
                  visionMetrics.trackingMode === "live-mesh"
                    ? "Landmarks active"
                    : "Initializing or idle",
              },
              {
                label: "Face lock",
                value: visionMetrics.faceDetected ? "Locked" : "Aligning",
                tone: faceLockTone(visionMetrics.faceDetected),
                detail: visionMetrics.faceDetected
                  ? `${visionMetrics.landmarkCount} pts`
                  : "Awaiting face",
              },
              {
                label: "Ocular risk",
                value: visionMetrics.risk,
                tone: riskTone(visionMetrics.risk),
                detail: `EAR ${visionMetrics.ear.toFixed(2)}`,
              },
              {
                label: "Blink rate",
                value: `${visionMetrics.blinkRate.toFixed(1)}/min`,
                tone: blinkRateTone(visionMetrics.blinkRate),
                detail: blinkRateContext(visionMetrics.blinkRate),
              },
              {
                label: "Fixation",
                value: `${visionMetrics.fixation}%`,
                tone: "info",
                detail: "Iris-position stability",
              },
              {
                label: "Pursuit runs",
                value: `${pursuitHistory.length}`,
                tone: "info",
                detail: latest ? `Latest ${relativeTime(latest.createdAt)}` : "None recorded",
              },
            ]}
          />
        </div>
      </section>

      {/* Pursuit test breakdown */}
      <section className="space-y-3">
        <SectionHeading
          icon={<TargetIcon size={14} />}
          eyebrow="Pursuit test"
          title="Smooth pursuit eye movement"
          subtitle="Patient-initiated, 15-second sessions"
        />
        {latest ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PursuitMetric
                label="Latest gain"
                value={latest.gain.toFixed(2)}
                hint="Ideal ≈ 1.00"
                warn={latest.gain < 0.7 || latest.gain > 1.3}
              />
              <PursuitMetric
                label="Accuracy"
                value={`${Math.round(latest.accuracy)}%`}
                hint="Path adherence"
                warn={latest.accuracy < 60}
              />
              <PursuitMetric
                label="Saccade rate"
                value={`${latest.saccadeRate.toFixed(2)}/s`}
                hint="Velocity spikes"
                warn={latest.saccadeRate > 1.5}
              />
              <PursuitMetric
                label="Latency"
                value={`${Math.round(latest.latency)}ms`}
                hint="Phase shift"
                warn={latest.latency > 280}
              />
            </div>
            {history.length >= 2 ? <GainTrend history={history} /> : null}
            <RecentSessions history={[...history].reverse()} />
          </>
        ) : (
          <EmptyPursuit />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Hero

interface SummaryShape {
  tone: "good" | "warning" | "danger";
  title: string;
  message: string;
}

function summarize({
  visionMetrics,
  pursuitHistory,
}: {
  visionMetrics: VisionMetrics;
  pursuitHistory: ReadonlyArray<StoredPursuitResult>;
}): SummaryShape {
  if (visionMetrics.risk === "High") {
    return {
      tone: "danger",
      title: "Elevated ocular signals",
      message:
        "Live blink and gaze stability indicators are extreme. Consider a clinical review.",
    };
  }
  const latest = pursuitHistory.at(-1);
  if (latest && latest.risk === "High") {
    return {
      tone: "warning",
      title: "Last pursuit reading was high risk",
      message: `Gain ${latest.gain.toFixed(2)} · accuracy ${Math.round(latest.accuracy)}% · saccade rate ${latest.saccadeRate.toFixed(2)}/s.`,
    };
  }
  if (visionMetrics.risk === "Moderate") {
    return {
      tone: "warning",
      title: "Moderate ocular signals",
      message:
        "Blink rate or stability sit outside typical adult ranges. Worth watching.",
    };
  }
  if (latest) {
    return {
      tone: "good",
      title: "Within typical ranges",
      message: `Latest pursuit ${latest.risk.toLowerCase()} risk · ${pursuitHistory.length} sessions stored.`,
    };
  }
  return {
    tone: "good",
    title: "Live monitoring active",
    message: "No pursuit sessions recorded yet — the patient hasn't run one.",
  };
}

function Hero({ summary }: { summary: SummaryShape }) {
  const surface =
    summary.tone === "danger"
      ? "border-red-200 bg-gradient-to-br from-red-50 via-rose-50 to-white"
      : summary.tone === "warning"
        ? "border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white"
        : "border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white";
  const iconWrap =
    summary.tone === "danger"
      ? "bg-red-100 text-red-700"
      : summary.tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : "bg-cyan-100 text-cyan-700";
  const Icon =
    summary.tone === "danger"
      ? AlertTriangle
      : summary.tone === "warning"
        ? Eye
        : CheckCircle2;
  return (
    <section
      className={cx(
        "flex flex-col gap-4 rounded-3xl border p-5 shadow-(--shadow-soft) sm:flex-row sm:items-center sm:gap-5 sm:p-6",
        surface,
      )}
    >
      <span
        className={cx(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-md",
          iconWrap,
        )}
      >
        <Icon size={22} aria-hidden />
      </span>
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Ocular biomarkers
        </h1>
        <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-slate-700">
          {summary.title}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-700">{summary.message}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------- Helper components

function SectionHeading({
  icon,
  eyebrow,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
          {eyebrow}
        </div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function PursuitMetric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border bg-white p-4 shadow-(--shadow-soft)",
        warn ? "border-amber-200" : "border-slate-200",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        {warn ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
            Watch
          </span>
        ) : null}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------- Gain trend chart

function GainTrend({ history }: { history: ReadonlyArray<StoredPursuitResult> }) {
  const width = 800;
  const height = 120;
  const padX = 28;
  const padY = 18;
  const values = history.map((entry) => entry.gain);
  const min = Math.min(0.4, ...values);
  const max = Math.max(1.4, ...values);
  const stepX =
    history.length === 1 ? 0 : (width - padX * 2) / (history.length - 1);

  const path = history
    .map((entry, idx) => {
      const x = padX + idx * stepX;
      const y =
        height - padY - ((entry.gain - min) / (max - min)) * (height - padY * 2);
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Reference band: healthy gain ≈ 0.85–1.15
  const bandTop =
    height - padY - ((1.15 - min) / (max - min)) * (height - padY * 2);
  const bandBottom =
    height - padY - ((0.85 - min) / (max - min)) * (height - padY * 2);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <figcaption className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Pursuit gain trend
        </div>
        <span className="text-[11px] text-slate-500">
          last {history.length} session{history.length === 1 ? "" : "s"}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[120px] w-full"
        role="img"
        aria-label="Pursuit gain over recent sessions"
      >
        <title>Pursuit gain trend</title>
        <rect x="0" y="0" width={width} height={height} rx="14" fill="#f8fafc" />
        {/* Healthy band */}
        <rect
          x={padX}
          y={Math.min(bandTop, bandBottom)}
          width={width - padX * 2}
          height={Math.abs(bandBottom - bandTop)}
          fill="rgba(16, 185, 129, 0.08)"
        />
        {/* Ideal line at 1.0 */}
        <line
          x1={padX}
          y1={height - padY - ((1 - min) / (max - min)) * (height - padY * 2)}
          x2={width - padX}
          y2={height - padY - ((1 - min) / (max - min)) * (height - padY * 2)}
          stroke="rgba(16,185,129,0.6)"
          strokeDasharray="6 6"
        />
        {path ? (
          <path
            d={path}
            fill="none"
            stroke="#0891b2"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {history.map((entry, idx) => {
          const x = padX + idx * stepX;
          const y =
            height - padY - ((entry.gain - min) / (max - min)) * (height - padY * 2);
          const fill =
            entry.risk === "High"
              ? "#ef4444"
              : entry.risk === "Moderate"
                ? "#f59e0b"
                : "#0891b2";
          return <circle key={entry.id} cx={x} cy={y} r="3.5" fill={fill} />;
        })}
        <text x={padX} y={12} fill="rgba(71,85,105,0.85)" fontSize="10" fontWeight="600">
          {max.toFixed(2)}
        </text>
        <text x={padX} y={height - 4} fill="rgba(71,85,105,0.85)" fontSize="10" fontWeight="600">
          {min.toFixed(2)}
        </text>
        <text
          x={width - padX}
          y={12}
          textAnchor="end"
          fill="rgba(16,185,129,0.85)"
          fontSize="10"
          fontWeight="700"
        >
          ideal 0.85–1.15
        </text>
      </svg>
    </figure>
  );
}

// -------------------------------------------------------- Recent sessions list

function RecentSessions({ history }: { history: ReadonlyArray<StoredPursuitResult> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-(--shadow-soft)">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <History size={14} aria-hidden />
          Recent sessions
        </div>
      </div>
      <ul>
        {history.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  "h-2 w-2 rounded-full",
                  entry.risk === "High"
                    ? "bg-red-500"
                    : entry.risk === "Moderate"
                      ? "bg-amber-500"
                      : "bg-emerald-500",
                )}
                aria-hidden
              />
              <span className="text-sm font-semibold text-slate-900">
                Gain {entry.gain.toFixed(2)} · {Math.round(entry.accuracy)}%
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {entry.saccadeRate.toFixed(2)} sacc/s · {Math.round(entry.latency)}ms ·{" "}
              {relativeTime(entry.createdAt)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyPursuit() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">
        <Sparkles size={20} aria-hidden />
      </span>
      <div>
        <div className="text-base font-semibold text-slate-900">No pursuit sessions yet</div>
        <p className="mt-1 max-w-xs text-xs text-slate-600">
          The patient runs the test from the Eye check tab in their view. Results sync here
          automatically.
        </p>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Tone helpers

function blinkRateTone(rate: number): "good" | "warning" | "danger" | "calm" {
  if (rate === 0) return "calm";
  if (rate < 5 || rate > 40) return "danger";
  if (rate < 10 || rate > 25) return "warning";
  return "good";
}

function blinkRateContext(rate: number): string {
  if (rate === 0) return "No samples yet";
  if (rate < 5) return "Very low — typical < 10";
  if (rate > 40) return "Very high — typical 10–20";
  if (rate < 10 || rate > 25) return "Outside typical range";
  return "Within typical range";
}
