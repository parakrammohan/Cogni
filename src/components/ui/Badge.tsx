import type { ReactNode } from "react";

import { cx } from "../../lib/utils";
import type { AlertSeverity } from "../../types/app";

interface BadgeProps {
  tone?: AlertSeverity;
  children: ReactNode;
  className?: string;
}

const TONES: Record<AlertSeverity, string> = {
  calm: "border-slate-200 bg-slate-50 text-slate-700",
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export default function Badge({ tone = "calm", children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
