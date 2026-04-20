import type { ReactNode } from "react";

import { cx } from "../../lib/utils";
import type { AlertSeverity } from "../../types/app";

interface StatusBoardItem {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: AlertSeverity;
}

interface StatusBoardProps {
  items: StatusBoardItem[];
  light?: boolean;
  columns?: string;
}

function toneClasses(light: boolean, tone: AlertSeverity) {
  if (light) {
    if (tone === "good") return "border-emerald-300 bg-emerald-100 text-emerald-800";
    if (tone === "warning") return "border-amber-300 bg-amber-100 text-amber-900";
    if (tone === "danger") return "border-red-300 bg-red-100 text-red-800";
    if (tone === "info") return "border-sky-300 bg-sky-100 text-sky-800";
    return "border-slate-300 bg-slate-100 text-slate-800";
  }

  if (tone === "good") return "border-emerald-300/90 bg-emerald-100 text-emerald-900";
  if (tone === "warning") return "border-amber-300/90 bg-amber-100 text-amber-950";
  if (tone === "danger") return "border-red-300/90 bg-red-100 text-red-900";
  if (tone === "info") return "border-sky-300/90 bg-sky-100 text-sky-900";
  return "border-slate-300/90 bg-slate-100 text-slate-900";
}

export default function StatusBoard({
  items,
  light = false,
  columns = "md:grid-cols-2 xl:grid-cols-4",
}: StatusBoardProps) {
  return (
    <div className={cx("grid gap-3", columns)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cx(
            "min-h-[118px] rounded-[22px] border p-4",
            light ? "border-slate-300 bg-white/90" : "border-white/10 bg-white/6",
          )}
        >
          <div className={cx("text-[11px] uppercase tracking-[0.28em]", light ? "text-slate-500" : "text-slate-400")}>
            {item.label}
          </div>
          <span
            className={cx(
              "mt-3 inline-flex min-h-[34px] items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
              toneClasses(light, item.tone || "calm"),
            )}
          >
            {item.value}
          </span>
          <div className={cx("mt-3 text-sm leading-6", light ? "text-slate-600" : "text-slate-300")}>
            {item.detail || " "}
          </div>
        </div>
      ))}
    </div>
  );
}
