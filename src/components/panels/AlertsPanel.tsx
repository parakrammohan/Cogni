import { useMemo, useState, type ReactElement } from "react";
import { AlertCircle, AlertTriangle, BellOff, CheckCircle2, Info, X } from "lucide-react";
import { cx, relativeTime } from "../../lib/utils";
import type { AppAlert } from "../../types/app";
import { useTranslation } from "react-i18next";
interface AlertsPanelProps {
  alerts: AppAlert[];
  /** @deprecated retained for backwards compat */
  light?: boolean;
  onClearAll?: () => void;
  onDismiss?: (id: string) => void;
  scrollable?: boolean;
}
const SEVERITY_STYLES: Record<
  AppAlert["severity"],
  {
    wrapper: string;
    icon: ReactElement;
  }
> = {
  danger: {
    wrapper: "border-red-200 bg-red-50/70",
    icon: <AlertCircle size={16} className="text-red-600" />,
  },
  warning: {
    wrapper: "border-amber-200 bg-amber-50/70",
    icon: <AlertTriangle size={16} className="text-amber-600" />,
  },
  info: {
    wrapper: "border-sky-200 bg-sky-50/70",
    icon: <Info size={16} className="text-sky-600" />,
  },
  good: {
    wrapper: "border-emerald-200 bg-emerald-50/70",
    icon: <CheckCircle2 size={16} className="text-emerald-600" />,
  },
  calm: {
    wrapper: "border-slate-200 bg-slate-50",
    icon: <Info size={16} className="text-slate-500" />,
  },
};
const SEVERITY_RANK: Record<AppAlert["severity"], number> = {
  danger: 0,
  warning: 1,
  info: 2,
  good: 3,
  calm: 4,
};
type SeverityFilter = "all" | "critical";
export default function AlertsPanel({
  alerts,
  onClearAll,
  onDismiss,
  scrollable = false,
}: AlertsPanelProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const visible = useMemo(() => {
    return filter === "critical"
      ? alerts.filter((a) => a.severity === "danger" || a.severity === "warning")
      : alerts;
  }, [alerts, filter]);

  // Group by module, then sort each group by severity then recency.
  const grouped = useMemo(() => {
    const byModule = new Map<string, AppAlert[]>();
    for (const a of visible) {
      const key = a.module || "Other";
      const arr = byModule.get(key);
      if (arr) arr.push(a);
      else byModule.set(key, [a]);
    }
    for (const arr of byModule.values()) {
      arr.sort((a, b) => {
        const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        return r !== 0 ? r : b.createdAt - a.createdAt;
      });
    }
    // Order modules by their most-severe alert.
    return [...byModule.entries()].sort((a, b) => {
      const aTop = SEVERITY_RANK[a[1][0]!.severity];
      const bTop = SEVERITY_RANK[b[1][0]!.severity];
      return aTop - bTop;
    });
  }, [visible]);
  const counts = useMemo(() => {
    let critical = 0;
    for (const a of alerts) {
      if (a.severity === "danger" || a.severity === "warning") critical += 1;
    }
    return {
      total: alerts.length,
      critical,
    };
  }, [alerts]);
  return (
    <div className="grid gap-3">
      {alerts.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {alerts.length} {alerts.length === 1 ? "notification" : "notifications"}
          </div>
          <div
            role="tablist"
            aria-label={t("alertsPanel.severityFilter")}
            className="inline-flex rounded-full bg-white p-0.5 shadow-sm ring-1 ring-slate-200"
          >
            <FilterButton
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label={`All (${counts.total})`}
            />
            <FilterButton
              active={filter === "critical"}
              onClick={() => setFilter("critical")}
              label={`Critical only (${counts.critical})`}
            />
          </div>
          {onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 transition hover:bg-slate-50"
            >
              {t("alertsPanel.clearAll")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={cx("grid gap-4", scrollable && "max-h-[520px] overflow-y-auto pr-1")}>
        {visible.length === 0 ? (
          alerts.length === 0 ? (
            <EmptyState />
          ) : (
            <FilteredEmpty onShowAll={() => setFilter("all")} />
          )
        ) : null}
        {grouped.map(([moduleName, items]) => (
          <section key={moduleName} className="grid gap-2">
            <header className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {moduleName}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {items.length}
              </span>
            </header>
            {items.map((alert) => {
              const style = SEVERITY_STYLES[alert.severity];
              return (
                <article
                  key={alert.id}
                  className={cx(
                    "rounded-2xl border p-4 shadow-(--shadow-soft) transition",
                    style.wrapper,
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                      {style.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{alert.title}</h3>
                        <span className="text-xs uppercase tracking-wider text-slate-500">
                          {relativeTime(alert.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-6 text-slate-700">{alert.message}</p>
                    </div>
                    {onDismiss ? (
                      <button
                        type="button"
                        aria-label={`Dismiss alert: ${alert.title}`}
                        onClick={() => onDismiss(alert.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        "rounded-full px-3 py-1 text-xs font-semibold transition",
        active ? "bg-cyan-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}
function FilteredEmpty({ onShowAll }: { onShowAll: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-500 shadow-sm">
        <CheckCircle2 size={18} aria-hidden />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-700">
          {t("alertsPanel.noCriticalNotifications")}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {t("alertsPanel.onlyInfoAllClearMessagesAreQueue")}
        </div>
      </div>
      <button
        type="button"
        onClick={onShowAll}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 transition hover:bg-slate-50"
      >
        {t("alertsPanel.showAll")}
      </button>
    </div>
  );
}
function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
        <BellOff size={20} aria-hidden />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-700">{t("alertsPanel.allQuiet")}</div>
        <div className="mt-1 text-xs text-slate-500">
          {t("alertsPanel.anomalyNotificationsWillSurfaceH")}
        </div>
      </div>
    </div>
  );
}
