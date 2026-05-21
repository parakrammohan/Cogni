import { ArrowDownRight, ArrowUpRight, Minus, TrendingDown } from "lucide-react";

import TrendPanel from "../../components/panels/TrendPanel";
import { cx } from "../../lib/utils";
import type { GameSession } from "../../types/app";

interface TrendsSceneProps {
  history: GameSession[];
}

/** Minimum sessions before we trust a slope as more than noise. */
const SLOPE_WINDOW = 8;

/**
 * Least-squares slope of `values` against session index. Returns
 * `{ slope, stddev }` where stddev is the per-session std-dev of the
 * raw values — a slope is considered "significant" when its
 * per-session magnitude exceeds ~1/3 of stddev across the window
 * (rough cohort-level effect size).
 */
function regress(values: readonly number[]): { slope: number; intercept: number; stddev: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, stddev: 0 };
  const mean_x = (n - 1) / 2;
  const mean_y = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mean_x) * (values[i]! - mean_y);
    den += (i - mean_x) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = mean_y - slope * mean_x;
  const variance = values.reduce((s, v) => s + (v - mean_y) ** 2, 0) / n;
  return { slope, intercept, stddev: Math.sqrt(variance) };
}

type SignalTone = "decline" | "neutral" | "improvement";

interface SlopeSignal {
  label: string;
  /** Plain-language summary of the slope. */
  summary: string;
  slopePerSession: number;
  unit: string;
  tone: SignalTone;
  /** How many of the most recent finalized sessions contributed. */
  windowSize: number;
}

function classify(slope: number, stddev: number, lowerIsBetter: boolean): SignalTone {
  // No data, flat line, or std-dev tiny relative to scale → neutral.
  if (stddev < 1e-6 || Math.abs(slope) < stddev / 3) return "neutral";
  const declineDirection = lowerIsBetter ? slope > 0 : slope < 0;
  return declineDirection ? "decline" : "improvement";
}

function computeSignals(history: readonly GameSession[]): SlopeSignal[] {
  const finals = history.filter((s) => s.status === "final").slice(-SLOPE_WINDOW * 2);
  const window = finals.slice(-SLOPE_WINDOW);
  if (window.length < 4) return [];

  const spans = window.map((s) => s.memorySpan);
  const reactions = window.map((s) => s.avgReaction);

  const spanReg = regress(spans);
  const reactReg = regress(reactions);

  return [
    {
      label: "Memory span",
      summary:
        spanReg.slope > 0
          ? `Climbing about ${spanReg.slope.toFixed(2)} per session`
          : spanReg.slope < 0
            ? `Dropping about ${Math.abs(spanReg.slope).toFixed(2)} per session`
            : "Flat across the last sessions",
      slopePerSession: spanReg.slope,
      unit: "span/session",
      tone: classify(spanReg.slope, spanReg.stddev, /*lowerIsBetter*/ false),
      windowSize: window.length,
    },
    {
      label: "Reaction time",
      summary:
        reactReg.slope > 0
          ? `Slowing by about ${Math.round(reactReg.slope)} ms per session`
          : reactReg.slope < 0
            ? `Speeding up by about ${Math.round(Math.abs(reactReg.slope))} ms per session`
            : "Flat across the last sessions",
      slopePerSession: reactReg.slope,
      unit: "ms/session",
      tone: classify(reactReg.slope, reactReg.stddev, /*lowerIsBetter*/ true),
      windowSize: window.length,
    },
  ];
}

export function TrendsScene({ history }: TrendsSceneProps) {
  const signals = computeSignals(history);
  const declining = signals.filter((s) => s.tone === "decline");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Cognitive trends
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          How the patient&apos;s memory span and reaction time have moved over the
          last few sequence-recall sessions. An early-warning view — not a
          clinical assessment.
        </p>
      </header>

      {signals.length > 0 ? (
        <section
          className={cx(
            "rounded-2xl border p-5 shadow-(--shadow-soft)",
            declining.length > 0
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50",
          )}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wider">
            {declining.length > 0 ? (
              <>
                <TrendingDown size={16} className="text-amber-700" aria-hidden />
                <span className="text-amber-900">
                  Decline signal across the last {signals[0]!.windowSize} sessions
                </span>
              </>
            ) : (
              <>
                <Minus size={16} className="text-emerald-700" aria-hidden />
                <span className="text-emerald-900">
                  Steady across the last {signals[0]!.windowSize} sessions
                </span>
              </>
            )}
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {signals.map((s) => (
              <li
                key={s.label}
                className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{s.label}</span>
                  <SlopeBadge tone={s.tone} />
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-700">{s.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          A trend signal needs at least four finalized sessions before
          it&apos;s shown. Run a few more sequence-recall games to start
          tracking memory span + reaction time slopes here.
        </section>
      )}

      <TrendPanel history={history} />

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
        <p>
          <strong>How decline detection works:</strong> we fit a least-squares
          line through the last {SLOPE_WINDOW} finalized sessions. A slope
          beyond a third of the window&apos;s own standard deviation is
          flagged as a decline (for memory span: going down; for reaction
          time: going up). Heuristic-only, not a clinical assessment.
        </p>
      </section>
    </div>
  );
}

function SlopeBadge({ tone }: { tone: SignalTone }) {
  if (tone === "decline") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        <ArrowDownRight size={12} aria-hidden /> declining
      </span>
    );
  }
  if (tone === "improvement") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        <ArrowUpRight size={12} aria-hidden /> improving
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      <Minus size={12} aria-hidden /> stable
    </span>
  );
}
