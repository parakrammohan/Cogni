import type { ReactNode } from "react";

import { cx } from "../../lib/utils";
import type { AlertSeverity } from "../../types/app";

const TONES = {
  calm: "border-slate-300/80 bg-slate-100 text-slate-800",
  good: "border-emerald-300/90 bg-emerald-100 text-emerald-800",
  warning: "border-amber-300/90 bg-amber-100 text-amber-900",
  danger: "border-red-300/90 bg-red-100 text-red-800",
  info: "border-sky-300/90 bg-sky-100 text-sky-800",
};

interface BadgeProps {
  tone?: AlertSeverity;
  children: ReactNode;
}

export default function Badge({ tone = "calm", children }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]",
        TONES[tone] || TONES.calm,
      )}
    >
      {children}
    </span>
  );
}
