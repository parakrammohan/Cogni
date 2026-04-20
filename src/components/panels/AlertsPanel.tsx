import Badge from "../ui/Badge";
import { cx, relativeTime } from "../../lib/utils";
import type { AppAlert } from "../../types/app";

interface AlertsPanelProps {
  alerts: AppAlert[];
  light?: boolean;
  onClearAll?: () => void;
  onDismiss?: (id: string) => void;
  scrollable?: boolean;
}

function lightToneClasses(severity: AppAlert["severity"]) {
  if (severity === "danger") return "border-red-300 bg-red-50 text-red-700";
  if (severity === "warning") return "border-amber-300 bg-amber-50 text-amber-700";
  if (severity === "good") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (severity === "info") return "border-cyan/30 bg-cyan/10 text-sky-800";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

export default function AlertsPanel({
  alerts,
  light = false,
  onClearAll,
  onDismiss,
  scrollable = false,
}: AlertsPanelProps) {
  return (
    <div className={cx("grid gap-3", light ? "text-ink" : "text-mist")}>
      {onClearAll && alerts.length ? (
        <div className="flex items-center justify-between gap-3">
          <div className={cx("text-xs uppercase tracking-[0.24em]", light ? "text-slate-500" : "text-slate-400")}>
            {alerts.length} notifications
          </div>
          <button
            onClick={onClearAll}
            className={cx(
              "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition",
              light
                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                : "border-white/10 bg-white/8 text-white hover:bg-white/14",
            )}
          >
            Clear all
          </button>
        </div>
      ) : null}
      <div className={cx("grid gap-3", scrollable && "max-h-[520px] overflow-y-auto pr-1")}>
        {alerts.length ? (
          alerts.map((alert) => (
            <article
              key={alert.id}
              className={cx(
                "rounded-[22px] border p-4",
                light ? "border-slate-300 bg-white/85" : "border-white/10 bg-slate-950/60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    {alert.module}
                  </div>
                  <h3 className={cx("mt-1 text-base font-semibold", light ? "text-ink" : "text-white")}>
                    {alert.title}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {light ? (
                    <span
                      className={cx(
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                        lightToneClasses(alert.severity),
                      )}
                    >
                      {alert.severity}
                    </span>
                  ) : (
                    <Badge tone={alert.severity}>{alert.severity}</Badge>
                  )}
                  {onDismiss ? (
                    <button
                      onClick={() => onDismiss(alert.id)}
                      className={cx(
                        "rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                        light
                          ? "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                          : "border-white/10 bg-white/8 text-slate-200 hover:bg-white/14",
                      )}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              <p className={cx("mt-2 text-sm leading-6", light ? "text-slate-700" : "text-slate-300")}>
                {alert.message}
              </p>
              <div className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-400">
                {relativeTime(alert.createdAt)}
              </div>
            </article>
          ))
        ) : (
          <div
            className={cx(
              "rounded-[24px] border border-dashed p-6 text-sm",
              light ? "border-slate-300 bg-white/70 text-slate-500" : "border-white/10 bg-slate-950/40 text-slate-400",
            )}
          >
            No anomalies detected yet.
          </div>
        )}
      </div>
    </div>
  );
}
