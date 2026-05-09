import type { GaitAnalysis } from "../../features/motion/lib/gait";
import type { MotionSample } from "../../types/app";

interface GaitPanelProps {
  motionSamples: MotionSample[];
  gait: GaitAnalysis;
}

const CHART_WIDTH = 820;
const CHART_HEIGHT = 320;
const PADDING_X = 56;
const PADDING_Y = 30;

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
      const x = PADDING_X + (index / (values.length - 1)) * (width - PADDING_X - 16);
      const y =
        height - PADDING_Y - ((value - minValue) / range) * (height - PADDING_Y * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function GaitPanel({ motionSamples, gait }: GaitPanelProps) {
  const recent = motionSamples.slice(-90);
  const zValues = recent.map((s) => s.z);
  const magValues = recent.map((s) => s.magnitude);
  const combined = [...zValues, ...magValues];
  const minValue = combined.length ? Math.min(...combined) : -1;
  const maxValue = combined.length ? Math.max(...combined) : 2;
  const zPath = buildPath(zValues, CHART_WIDTH, CHART_HEIGHT, minValue, maxValue);
  const magPath = buildPath(magValues, CHART_WIDTH, CHART_HEIGHT, minValue, maxValue);
  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const value = maxValue - ((maxValue - minValue) / 3) * i;
    const y = PADDING_Y + ((CHART_HEIGHT - PADDING_Y * 2) / 3) * i;
    return { value, y };
  });

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <figcaption className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Live gait waveform
          </div>
          <div className="mt-0.5 text-base font-semibold text-slate-900">
            Last 3 seconds of smoothed acceleration
          </div>
        </div>
        <span className="text-sm font-semibold text-slate-700">{gait.label}</span>
      </figcaption>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs uppercase tracking-wider text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" aria-hidden />
          Z-axis vertical
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500" aria-hidden />
          Total magnitude
        </span>
        <span>30Hz sample rate</span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-[280px] w-full"
        role="img"
        aria-label="Gait waveform showing vertical acceleration and total magnitude over the last 3 seconds"
      >
        <title>Gait waveform — last 3 seconds</title>
        <rect x="0" y="0" width={CHART_WIDTH} height={CHART_HEIGHT} rx="16" fill="#f8fafc" />
        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={PADDING_X}
              y1={tick.y}
              x2={CHART_WIDTH - 16}
              y2={tick.y}
              stroke="rgba(15,23,42,0.06)"
              strokeDasharray="4 8"
            />
            <text
              x={PADDING_X - 8}
              y={tick.y + 4}
              textAnchor="end"
              fill="rgba(71,85,105,0.85)"
              fontSize="10"
              fontWeight="600"
            >
              {tick.value.toFixed(1)}
            </text>
          </g>
        ))}
        {[PADDING_X, 312, 560, CHART_WIDTH - 16].map((x, idx, all) => (
          <g key={`${x}-${idx}`}>
            <line
              x1={x}
              y1={PADDING_Y}
              x2={x}
              y2={CHART_HEIGHT - PADDING_Y / 2}
              stroke="rgba(15,23,42,0.04)"
            />
            <text
              x={x}
              y={CHART_HEIGHT - 8}
              textAnchor={idx === 0 ? "start" : idx === all.length - 1 ? "end" : "middle"}
              fill="rgba(100,116,139,0.85)"
              fontSize="10"
              fontWeight="600"
            >
              {idx === 0 ? "-3.0s" : idx === 1 ? "-2.0s" : idx === 2 ? "-1.0s" : "now"}
            </text>
          </g>
        ))}
        {zPath ? (
          <path
            d={zPath}
            fill="none"
            stroke="#0891b2"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {magPath ? (
          <path
            d={magPath}
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </figure>
  );
}
