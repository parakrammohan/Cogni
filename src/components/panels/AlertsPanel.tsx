import type { ReactElement } from "react";
import { AlertCircle, AlertTriangle, BellOff, CheckCircle2, Info, X } from "lucide-react";

import { cx, relativeTime } from "../../lib/utils";
import type { AppAlert } from "../../types/app";

interface AlertsPanelProps {
  alerts: AppAlert[];
  /** @deprecated retained for backwards compat */
  light?: boolean;
  onClearAll?: () => void;
  onDismiss?: (id: string) => void;
  scrollable?: boolean;
}

const SEVERITY_STYLES: Record<AppAlert["severity"], { wrapper: string; icon: ReactElement }> = {
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

export default function AlertsPanel({
  alerts,
  onClearAll,
  onDismiss,
  scrollable = false,
}: AlertsPanelProps) {
  return (
    <div className="grid gap-3">
      {onClearAll && alerts.length ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {alerts.length} {alerts.length === 1 ? "notification" : "notifications"}
          </div>
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 transition hover:bg-slate-50"
          >
            Clear all
          </button>
        </div>
      ) : null}
      <div className={cx("grid gap-2", scrollable && "max-h-[520px] overflow-y-auto pr-1")}>
        {alerts.length === 0 ? <EmptyState /> : null}
        {alerts.map((alert) => {
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
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {alert.module}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">{alert.title}</h3>
                    </div>
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
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
        <BellOff size={20} aria-hidden />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-700">All quiet</div>
        <div className="mt-1 text-xs text-slate-500">
          Anomaly notifications will surface here as they happen.
        </div>
      </div>
    </div>
  );
}
