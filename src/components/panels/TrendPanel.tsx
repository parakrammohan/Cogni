import Badge from "../ui/Badge";
import { average } from "../../lib/utils";
import type { GameSession } from "../../types/app";

interface TrendPanelProps {
  history: GameSession[];
}

function buildPath(values: number[], width: number, height: number, min: number, max: number) {
  if (values.length < 2) return "";
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingY = 18;
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = paddingLeft + (index / Math.max(1, values.length - 1)) * (width - paddingLeft - paddingRight);
      const y = height - paddingY - ((value - min) / range) * (height - paddingY * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function TrendPanel({ history }: TrendPanelProps) {
  const chartWidth = 860;
  const chartHeight = 210;
  const recent = history.slice(-24);
  const spanValues = recent.map((entry) => entry.memorySpan);
  const reactionValues = recent.map((entry) => entry.avgReaction);

  const spanMin = spanValues.length ? Math.max(0, Math.min(...spanValues) - 1) : 0;
  const spanMax = spanValues.length ? Math.max(...spanValues) + 1 : 6;
  const reactionMin = reactionValues.length ? Math.max(0, Math.min(...reactionValues) - 80) : 0;
  const reactionMax = reactionValues.length ? Math.max(...reactionValues) + 80 : 900;

  const spanPath = buildPath(spanValues, chartWidth, chartHeight, spanMin, spanMax);
  const reactionPath = buildPath(reactionValues, chartWidth, chartHeight, reactionMin, reactionMax);
  const latest = recent[recent.length - 1];
  const avgSpan = spanValues.length ? average(spanValues).toFixed(1) : "0.0";
  const avgReaction = reactionValues.length ? Math.round(average(reactionValues)) : 0;
  const latestStatus = latest?.status === "checkpoint" ? "Live checkpoint" : "Final session";

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/65 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Sequence recall trend</div>
          <div className="mt-1 text-lg font-semibold text-white">Memory span vs reaction time</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latest ? <Badge tone={latest.status === "checkpoint" ? "warning" : "good"}>{latestStatus}</Badge> : null}
          <Badge tone="info">{history.length} sessions stored</Badge>
        </div>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[20px] border border-white/10 bg-white/6 p-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Average memory span</div>
            <div className="mt-2 text-2xl font-semibold text-white">{avgSpan}</div>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/6 p-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Average reaction</div>
            <div className="mt-2 text-2xl font-semibold text-white">{avgReaction}ms</div>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/6 p-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Latest session</div>
            <div className="mt-2 text-2xl font-semibold text-white">{latest ? `Span ${latest.memorySpan}` : "No data"}</div>
            <p className="mt-2 text-sm text-slate-300">
              {latest
                ? `Reaction ${Math.round(latest.avgReaction)}ms with ${latest.mistakes} mistakes.`
                : "Run a sequence recall session to start tracking trendlines."}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/6 p-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Span coverage</div>
            <div className="mt-2 text-2xl font-semibold text-white">{recent.length || 0}</div>
            <p className="mt-2 text-sm text-slate-300">
              {recent.length
                ? `Showing the most recent ${recent.length} stored sequence sessions.`
                : "No sequence sessions stored yet."}
            </p>
          </div>
        </div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[210px] w-full">
          <rect x="0" y="0" width={chartWidth} height={chartHeight} rx="20" fill="rgba(8,17,26,0.85)" />
          {[22, 80, 138, 194].map((line) => (
            <line
              key={line}
              x1="40"
              y1={line}
              x2={chartWidth - 16}
              y2={line}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 8"
            />
          ))}
          {[40, 250, 460, 670, chartWidth - 16].map((x, index, all) => (
            <g key={`${x}-${index}`}>
              <line x1={x} y1="22" x2={x} y2={chartHeight - 18} stroke="rgba(255,255,255,0.05)" />
              <text
                x={x}
                y={chartHeight - 6}
                textAnchor={index === 0 ? "start" : index === all.length - 1 ? "end" : "middle"}
                fill="rgba(148,163,184,0.9)"
                fontSize="10"
                fontWeight="700"
              >
                {index === 0 ? "Oldest" : index === all.length - 1 ? "Latest" : `S${index + 1}`}
              </text>
            </g>
          ))}
          <text x="40" y="15" fill="rgba(109,226,255,0.9)" fontSize="10" fontWeight="700">
            Span scale {spanMin}-{spanMax}
          </text>
          <text
            x={chartWidth - 16}
            y="15"
            textAnchor="end"
            fill="rgba(255,111,77,0.9)"
            fontSize="10"
            fontWeight="700"
          >
            Reaction scale {Math.round(reactionMin)}-{Math.round(reactionMax)}ms
          </text>
          {spanPath ? (
            <path d={spanPath} fill="none" stroke="rgba(109,226,255,0.95)" strokeWidth="3" strokeLinecap="round" />
          ) : null}
          {reactionPath ? (
            <path d={reactionPath} fill="none" stroke="rgba(255,111,77,0.85)" strokeWidth="2.5" strokeLinecap="round" />
          ) : null}
          {spanValues.map((value, index) => {
            const x = 40 + (index / Math.max(1, spanValues.length - 1)) * (chartWidth - 56);
            const y =
              chartHeight - 18 - ((value - spanMin) / ((spanMax - spanMin) || 1)) * (chartHeight - 36);
            return <circle key={`span-${index}`} cx={x} cy={y} r="3.5" fill="rgba(109,226,255,1)" />;
          })}
          {reactionValues.map((value, index) => {
            const x = 40 + (index / Math.max(1, reactionValues.length - 1)) * (chartWidth - 56);
            const y =
              chartHeight -
              18 -
              ((value - reactionMin) / ((reactionMax - reactionMin) || 1)) * (chartHeight - 36);
            return <circle key={`react-${index}`} cx={x} cy={y} r="3" fill="rgba(255,111,77,0.95)" />;
          })}
        </svg>
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Reading guide</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Cyan trending upward is favorable because memory span is increasing. Orange trending downward is favorable
              because reaction time is dropping.
            </p>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Live update behavior</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The chart now updates at each cleared span during a run, then finalizes when the session ends.
            </p>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Interpretation</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              A flat or rising reaction line with falling span can indicate strain even before a session fully ends.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan"></span>
          Memory span
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-signal"></span>
          Avg reaction
        </span>
      </div>
    </div>
  );
}
