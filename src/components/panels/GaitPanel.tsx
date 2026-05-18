import { useEffect, useState } from "react";

import type { GaitAnalysis } from "../../features/motion/lib/gait";
import type { MotionSample } from "../../types/app";

interface GaitPanelProps {
  motionSamples: MotionSample[];
  gait: GaitAnalysis;
}

/**
 * Gait scope. Four separate sparklines (X, Y, Z, magnitude) over the
 * last ~3 seconds, plus a live streaming indicator driven by the age
 * of the most recent sample.
 */
export default function GaitPanel({ motionSamples, gait }: GaitPanelProps) {
  const recent = motionSamples.slice(-90);
  const latest = recent.at(-1);

  // Re-render every 500 ms while the panel is mounted so the streaming
  // pill stays accurate even when no new samples are arriving.
  const [, setTick] = useState(0);
  useEffect(() => {
    const handle = window.setInterval(() => setTick((n) => (n + 1) % 1_000), 500);
    return () => window.clearInterval(handle);
  }, []);

  const ageMs = latest ? Math.max(0, Date.now() - latest.timestamp) : Infinity;
  const isStreaming = ageMs < 2_000 && recent.length >= 5;

  if (recent.length === 0) {
    return (
      <figure className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <StreamingPill streaming={false} ageMs={null} />
        <div className="mt-2 text-sm font-semibold text-slate-700">No motion data</div>
        <div className="max-w-sm text-xs text-slate-500">
          Enable the motion sensor on the patient device, or turn on simulations from
          Parameters, to start streaming the gait waveform.
        </div>
      </figure>
    );
  }

  const axes = [
    { key: "x" as const, label: "X · Lateral", color: "#0ea5e9" },
    { key: "y" as const, label: "Y · Forward", color: "#10b981" },
    { key: "z" as const, label: "Z · Vertical", color: "#0891b2" },
    {
      key: "magnitude" as const,
      label: "Total magnitude",
      color: "#f97316",
    },
  ];

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Live gait waveform
          </div>
          <div className="mt-0.5 text-base font-semibold text-slate-900">
            Last 3 seconds of smoothed acceleration
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StreamingPill streaming={isStreaming} ageMs={ageMs} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
            {gait.label}
          </span>
        </div>
      </figcaption>

      <div className="grid gap-3 sm:grid-cols-2">
        {axes.map((axis) => (
          <AxisChart
            key={axis.key}
            label={axis.label}
            color={axis.color}
            values={recent.map((s) => s[axis.key])}
            unit={axis.key === "magnitude" ? "g" : "m/s²"}
          />
        ))}
      </div>
    </figure>
  );
}

// ----------------------------------------------------- Streaming indicator

function StreamingPill({
  streaming,
  ageMs,
}: {
  streaming: boolean;
  ageMs: number | null;
}) {
  const label = streaming
    ? "Streaming"
    : ageMs === null
      ? "Idle"
      : ageMs > 60_000
        ? "Idle"
        : `Stale ${Math.round(ageMs / 1000)}s`;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider " +
        (streaming
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-200 text-slate-700")
      }
    >
      <span
        aria-hidden
        className={
          "h-2 w-2 rounded-full " +
          (streaming ? "animate-pulse bg-emerald-500" : "bg-slate-400")
        }
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------- Individual sparkline

const CHART_W = 320;
const CHART_H = 110;
const PAD_X = 36;
const PAD_Y = 12;

function AxisChart({
  label,
  color,
  values,
  unit,
}: {
  label: string;
  color: string;
  values: readonly number[];
  unit: string;
}) {
  const latest = values.at(-1) ?? 0;
  const min = values.length ? Math.min(...values) : -1;
  const max = values.length ? Math.max(...values) : 1;
  // Pad the range so a near-flat signal isn't compressed to a single line.
  const range = Math.max(max - min, 0.5);
  const yMin = min - range * 0.1;
  const yMax = max + range * 0.1;

  const path = buildPath(values, CHART_W, CHART_H, yMin, yMax);
  const yMid = (yMin + yMax) / 2;
  const yMidScreen =
    CHART_H - PAD_Y - ((yMid - yMin) / (yMax - yMin)) * (CHART_H - PAD_Y * 2);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: color }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            {label}
          </span>
        </div>
        <span className="font-mono text-xs font-semibold text-slate-900">
          {latest.toFixed(2)} {unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="mt-2 h-[100px] w-full"
        role="img"
        aria-label={`${label} sparkline`}
      >
        <rect
          x="0"
          y="0"
          width={CHART_W}
          height={CHART_H}
          rx="10"
          fill="white"
          stroke="rgba(15,23,42,0.05)"
        />
        <line
          x1={PAD_X}
          y1={yMidScreen}
          x2={CHART_W - 8}
          y2={yMidScreen}
          stroke="rgba(15,23,42,0.08)"
          strokeDasharray="4 6"
        />
        <text
          x={PAD_X - 6}
          y={PAD_Y + 8}
          textAnchor="end"
          fill="rgba(71,85,105,0.85)"
          fontSize="10"
          fontWeight="600"
        >
          {yMax.toFixed(1)}
        </text>
        <text
          x={PAD_X - 6}
          y={CHART_H - PAD_Y / 2}
          textAnchor="end"
          fill="rgba(71,85,105,0.85)"
          fontSize="10"
          fontWeight="600"
        >
          {yMin.toFixed(1)}
        </text>
        {path ? (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </div>
  );
}

function buildPath(
  values: readonly number[],
  width: number,
  height: number,
  minValue: number,
  maxValue: number,
): string {
  if (values.length < 2) return "";
  const range = maxValue - minValue || 1;
  return values
    .map((value, index) => {
      const x = PAD_X + (index / (values.length - 1)) * (width - PAD_X - 8);
      const y =
        height - PAD_Y - ((value - minValue) / range) * (height - PAD_Y * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
