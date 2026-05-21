import { useEffect, useRef, useState } from "react";
import type { GaitAnalysis } from "../../features/motion/lib/gait";
import type { MotionSample } from "../../types/app";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      <figure className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <StreamingPill streaming={false} ageMs={null} />
        <div className="mt-2 text-sm font-semibold text-slate-800">
          {t("gaitPanel.noAccelerometerOrGyroscopeData")}
        </div>
        <div className="max-w-sm text-xs leading-5 text-slate-600">
          {t("gaitPanel.nothingIsCurrentlyComingOffThePa")}
        </div>
      </figure>
    );
  }
  const accelAxes: ReadonlyArray<{
    key: "x" | "y" | "z" | "magnitude";
    label: string;
    color: string;
  }> = [
    {
      key: "x",
      label: "X · Lateral",
      color: "#0ea5e9",
    },
    {
      key: "y",
      label: "Y · Forward",
      color: "#10b981",
    },
    {
      key: "z",
      label: "Z · Vertical",
      color: "#0891b2",
    },
    {
      key: "magnitude",
      label: "Total magnitude",
      color: "#f97316",
    },
  ];
  const rotAxes: ReadonlyArray<{
    key: "rotX" | "rotY" | "rotZ" | "rotMagnitude";
    label: string;
    color: string;
  }> = [
    {
      key: "rotX",
      label: "Pitch · β (around X)",
      color: "#a855f7",
    },
    {
      key: "rotY",
      label: "Roll · γ (around Y)",
      color: "#ec4899",
    },
    {
      key: "rotZ",
      label: "Yaw · α (around Z)",
      color: "#6366f1",
    },
    {
      key: "rotMagnitude",
      label: "Rotation magnitude",
      color: "#f43f5e",
    },
  ];

  // Some devices / desktop browsers leave `rotationRate` null; if every
  // sample is ~0 we hide the gyro row so the panel doesn't show four
  // flat lines.
  const gyroActive = recent.some(
    (s) => Math.abs(s.rotX) > 0.05 || Math.abs(s.rotY) > 0.05 || Math.abs(s.rotZ) > 0.05,
  );
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("gaitPanel.liveGaitWaveform")}
          </div>
          <div className="mt-0.5 text-base font-semibold text-slate-900">
            {t("gaitPanel.last3SecondsOfSmoothedMotion")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StreamingPill streaming={isStreaming} ageMs={ageMs} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
            {gait.label}
          </span>
        </div>
      </figcaption>

      <SectionLabel>{t("gaitPanel.linearAcceleration")}</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        {accelAxes.map((axis) => (
          <AxisChart
            key={axis.key}
            label={axis.label}
            color={axis.color}
            values={recent.map((s) => s[axis.key])}
            unit={axis.key === "magnitude" ? "g" : "m/s²"}
          />
        ))}
      </div>

      {gyroActive ? (
        <>
          <SectionLabel className="mt-4">{t("gaitPanel.rotationRateGyroscope")}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {rotAxes.map((axis) => (
              <AxisChart
                key={axis.key}
                label={axis.label}
                color={axis.color}
                values={recent.map((s) => s[axis.key])}
                unit="°/s"
              />
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
          {t("gaitPanel.gyroscopeDataNotAvailableOnThisD")}{" "}
          <code className="font-mono">{t("gaitPanel.devicemotioneventRotationrate")}</code>{" "}
          {t("gaitPanel.onlyWhenTheOsPermitsMostLaptopsA")}
        </p>
      )}
    </figure>
  );
}
function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      className={
        "mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500" +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------- Streaming indicator

function StreamingPill({ streaming, ageMs }: { streaming: boolean; ageMs: number | null }) {
  const { t } = useTranslation();
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
        (streaming ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700")
      }
    >
      <span
        aria-hidden
        className={
          "h-2 w-2 rounded-full " + (streaming ? "animate-pulse bg-emerald-500" : "bg-slate-400")
        }
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------- Individual sparkline

const CHART_H = 110;
const PAD_X = 32;
const PAD_Y = 10;

/**
 * Measure-then-draw: observe the rendered container width with
 * ResizeObserver and compute the path in real pixel space, so the
 * curve keeps its natural aspect ratio at any container size (vs
 * `preserveAspectRatio="none"` which would horizontally stretch).
 */
function useMeasuredWidth(initial = 320): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
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
  const { t } = useTranslation();
  const [containerRef, width] = useMeasuredWidth();
  const w = Math.max(width, 200);
  const h = CHART_H;
  const latest = values.at(-1) ?? 0;
  const min = values.length ? Math.min(...values) : -1;
  const max = values.length ? Math.max(...values) : 1;
  // Pad the range so a near-flat signal isn't compressed to a single line.
  const range = Math.max(max - min, 0.5);
  const yMin = min - range * 0.1;
  const yMax = max + range * 0.1;
  const path = buildPath(values, w, h, yMin, yMax);
  const yMid = (yMin + yMax) / 2;
  const yMidScreen = h - PAD_Y - ((yMid - yMin) / (yMax - yMin)) * (h - PAD_Y * 2);

  // Gradient stop colors derived from the line color so the fill sits
  // under the path and fades to transparent at the bottom of the chart.
  const gradientId = `gait-fill-${label.replace(/\W+/g, "-")}`;
  const areaPath = path ? `${path} L${w - 8},${h - PAD_Y} L${PAD_X},${h - PAD_Y} Z` : "";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: color,
            }}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            {label}
          </span>
        </div>
        <span className="font-mono text-xs font-semibold text-slate-900">
          {latest.toFixed(2)} {unit}
        </span>
      </div>
      <div ref={containerRef} className="relative w-full">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          className="block h-[110px] w-full"
          role="img"
          aria-label={`${label} sparkline`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            x1={PAD_X}
            y1={yMidScreen}
            x2={w - 8}
            y2={yMidScreen}
            stroke="rgba(15,23,42,0.08)"
            strokeDasharray="4 6"
          />
          <text
            x={PAD_X - 4}
            y={PAD_Y + 8}
            textAnchor="end"
            fill="rgba(71,85,105,0.7)"
            fontSize="10"
            fontWeight="600"
          >
            {yMax.toFixed(1)}
          </text>
          <text
            x={PAD_X - 4}
            y={h - PAD_Y / 2}
            textAnchor="end"
            fill="rgba(71,85,105,0.7)"
            fontSize="10"
            fontWeight="600"
          >
            {yMin.toFixed(1)}
          </text>
          {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
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
      const y = height - PAD_Y - ((value - minValue) / range) * (height - PAD_Y * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
