import type { GaitAnalysis, MotionSample } from "../../types/app";

interface GaitPanelProps {
  motionSamples: MotionSample[];
  gait: GaitAnalysis;
}

function buildSharedPath(
  values: number[],
  width: number,
  height: number,
  minValue: number,
  maxValue: number,
  paddingX = 44,
  paddingY = 20,
) {
  if (values.length < 2) return "";
  const range = maxValue - minValue || 1;

  return values
    .map((value, index) => {
      const x = paddingX + (index / (values.length - 1)) * (width - paddingX - 16);
      const y =
        height - paddingY - ((value - minValue) / range) * (height - paddingY * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function GaitPanel({ motionSamples, gait }: GaitPanelProps) {
  const chartWidth = 820;
  const chartHeight = 380;
  const recentSamples = motionSamples.slice(-90);
  const zValues = recentSamples.map((sample) => sample.z);
  const magnitudeValues = recentSamples.map((sample) => sample.magnitude);
  const combinedValues = [...zValues, ...magnitudeValues];
  const minValue = combinedValues.length ? Math.min(...combinedValues) : -1;
  const maxValue = combinedValues.length ? Math.max(...combinedValues) : 2;
  const zPath = buildSharedPath(zValues, chartWidth, chartHeight, minValue, maxValue, 64, 34);
  const magnitudePath = buildSharedPath(magnitudeValues, chartWidth, chartHeight, minValue, maxValue, 64, 34);
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = maxValue - ((maxValue - minValue) / 3) * index;
    const y = 34 + ((chartHeight - 68) / 3) * index;
    return { value, y };
  });

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Live gait waveform</div>
          <div className="mt-1 text-lg font-semibold text-white">Last 3 seconds of smoothed acceleration</div>
        </div>
        <span className={`text-sm font-semibold ${gait.color}`}>{gait.label}</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.18em] text-slate-400">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan"></span>
          Z-axis vertical acceleration
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-signal"></span>
          Total acceleration magnitude
        </span>
        <span>Sample rate 30Hz</span>
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[380px] w-full">
        <rect x="0" y="0" width={chartWidth} height={chartHeight} rx="20" fill="rgba(8,17,26,0.85)" />
        {yTicks.map((tick) => (
          <g key={`${tick.value}-${tick.y}`}>
            <line
              x1="64"
              y1={tick.y}
              x2={chartWidth - 16}
              y2={tick.y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 8"
            />
            <text
              x="56"
              y={tick.y + 4}
              textAnchor="end"
              fill="rgba(203,213,225,0.9)"
              fontSize="10"
              fontWeight="600"
            >
              {tick.value.toFixed(1)}
            </text>
          </g>
        ))}
        {[64, 312, 560, chartWidth - 16].map((x, index) => (
          <g key={`${x}-${index}`}>
            <line x1={x} y1="34" x2={x} y2={chartHeight - 24} stroke="rgba(255,255,255,0.05)" />
            <text
              x={x}
              y={chartHeight - 8}
              textAnchor={index === 0 ? "start" : index === 3 ? "end" : "middle"}
              fill="rgba(203,213,225,0.9)"
              fontSize="10"
              fontWeight="600"
            >
              {index === 0 ? "-3.0s" : index === 1 ? "-2.0s" : index === 2 ? "-1.0s" : "now"}
            </text>
          </g>
        ))}
        <text
          x="20"
          y={chartHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 20 ${chartHeight / 2})`}
          fill="rgba(148,163,184,0.85)"
          fontSize="10"
          fontWeight="700"
          letterSpacing="1.6"
        >
          ACCELERATION
        </text>
        {zPath ? (
          <path
            d={zPath}
            fill="none"
            stroke="rgba(109,226,255,0.95)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ) : null}
        {magnitudePath ? (
          <path
            d={magnitudePath}
            fill="none"
            stroke="rgba(255,111,77,0.78)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}
        <text
          x={chartWidth - 16}
          y="18"
          textAnchor="end"
          fill="rgba(148,163,184,0.85)"
          fontSize="10"
          fontWeight="700"
        >
          3-second rolling window
        </text>
      </svg>
    </div>
  );
}
