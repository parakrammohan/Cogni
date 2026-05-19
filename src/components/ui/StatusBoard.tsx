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
  /** @deprecated kept for backwards compat */
  light?: boolean;
  columns?: string;
}

const TONE_CLASSES: Record<AlertSeverity, string> = {
  calm: "border-slate-200 bg-slate-50 text-slate-700",
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export default function StatusBoard({
  items,
  columns = "md:grid-cols-2 xl:grid-cols-4",
}: StatusBoardProps) {
  return (
    <div className={cx("grid gap-3", columns)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-h-[120px] flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {item.label}
          </div>
          <span
            className={cx(
              "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
              TONE_CLASSES[item.tone ?? "calm"],
            )}
          >
            {item.value}
          </span>
          {item.detail ? (
            <div className="text-sm leading-6 text-slate-600">{item.detail}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
