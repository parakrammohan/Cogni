import { Brain } from "lucide-react";
import Badge from "../ui/Badge";
import { average } from "../../lib/utils";
import type { GameSession } from "../../types/app";
import { useTranslation } from "react-i18next";
interface TrendPanelProps {
  history: GameSession[];
}
const CHART_WIDTH = 860;
const CHART_HEIGHT = 220;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 16;
const PADDING_Y = 24;
function buildPath(
  values: readonly number[],
  width: number,
  height: number,
  min: number,
  max: number,
): string {
  if (values.length < 2) return "";
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x =
        PADDING_LEFT +
        (index / Math.max(1, values.length - 1)) * (width - PADDING_LEFT - PADDING_RIGHT);
      const y = height - PADDING_Y - ((value - min) / range) * (height - PADDING_Y * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
export default function TrendPanel({ history }: TrendPanelProps) {
  const { t } = useTranslation();
  const recent = history.slice(-24);
  if (!recent.length) {
    return <EmptyState />;
  }
  const spanValues = recent.map((entry) => entry.memorySpan);
  const reactionValues = recent.map((entry) => entry.avgReaction);
  const spanMin = Math.max(0, Math.min(...spanValues) - 1);
  const spanMax = Math.max(...spanValues) + 1;
  const reactionMin = Math.max(0, Math.min(...reactionValues) - 80);
  const reactionMax = Math.max(...reactionValues) + 80;
  const spanPath = buildPath(spanValues, CHART_WIDTH, CHART_HEIGHT, spanMin, spanMax);
  const reactionPath = buildPath(
    reactionValues,
    CHART_WIDTH,
    CHART_HEIGHT,
    reactionMin,
    reactionMax,
  );
  const latest = recent.at(-1);
  const avgSpan = average(spanValues).toFixed(1);
  const avgReaction = Math.round(average(reactionValues));
  const latestStatus =
    latest?.status === "checkpoint" ? t("trendPanel.checkpoint") : t("trendPanel.finalSession");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("trendPanel.sequenceRecallTrend")}
          </div>
          <div className="mt-0.5 text-base font-semibold text-slate-900">
            {t("trendPanel.memorySpanVsReactionTime")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latest ? (
            <Badge tone={latest.status === "checkpoint" ? "warning" : "good"}>{latestStatus}</Badge>
          ) : null}
          <Badge tone="info">
            {history.length} {t("trendPanel.sessionsStored")}
          </Badge>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("trendPanel.averageSpan")} value={avgSpan} />
        <Stat label={t("trendPanel.averageReaction")} value={`${avgReaction}ms`} />
        <Stat
          label={t("trendPanel.latest")}
          value={latest ? `Span ${latest.memorySpan}` : t("trendPanel.noData")}
          hint={
            latest
              ? `Reaction ${Math.round(latest.avgReaction)}ms with ${latest.mistakes} mistakes`
              : undefined
          }
        />
        <Stat
          label={t("trendPanel.spanCoverage")}
          value={`${recent.length}`}
          hint={`Showing last ${recent.length} sessions`}
        />
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="mt-4 h-[220px] w-full"
        role="img"
        aria-label={t("trendPanel.trendChartShowingMemorySpanAndRe")}
      >
        <title>{t("trendPanel.cognitiveTrend")}</title>
        <rect x="0" y="0" width={CHART_WIDTH} height={CHART_HEIGHT} rx="16" fill="#f8fafc" />
        {[40, 80, 120, 160, 200].map((line) => (
          <line
            key={line}
            x1={PADDING_LEFT}
            y1={(line / 220) * CHART_HEIGHT}
            x2={CHART_WIDTH - PADDING_RIGHT}
            y2={(line / 220) * CHART_HEIGHT}
            stroke="rgba(15,23,42,0.04)"
            strokeDasharray="4 8"
          />
        ))}
        {spanPath ? (
          <path
            d={spanPath}
            fill="none"
            stroke="#0891b2"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {reactionPath ? (
          <path
            d={reactionPath}
            fill="none"
            stroke="#f97316"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-600" aria-hidden />{" "}
          {t("trendPanel.memorySpan")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden />{" "}
          {t("trendPanel.reactionTime")}
        </span>
      </div>
    </div>
  );
}
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">
        <Brain size={20} aria-hidden />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-700">
          {t("trendPanel.noSessionsStored")}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {t("trendPanel.runASequenceRecallSessionInThePa")}
        </div>
      </div>
    </div>
  );
}
