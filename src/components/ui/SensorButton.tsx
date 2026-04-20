import type { ReactNode } from "react";

import { cx } from "../../lib/utils";

interface SensorButtonProps {
  active: boolean;
  label: string;
  icon: ReactNode;
  tone?: "dark" | "light";
  onClick: () => void;
}

export default function SensorButton({
  active,
  label,
  icon,
  tone = "dark",
  onClick,
}: SensorButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex h-full min-h-[88px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-[0_10px_24px_rgba(8,17,26,0.14)] transition hover:-translate-y-1 active:translate-y-0.5",
        tone === "light"
          ? active
            ? "border-ink/30 bg-ink text-white hover:bg-slate-800"
            : "border-slate-300 bg-white text-ink hover:border-ink/40 hover:bg-slate-50"
          : active
            ? "border-cyan/40 bg-cyan text-ink hover:bg-[#8beaff]"
            : "border-white/10 bg-white/8 text-mist hover:border-white/20 hover:bg-white/12",
        )}
      >
      <span
        className={cx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition",
          tone === "light"
            ? active
              ? "bg-white/10"
              : "bg-slate-100"
            : active
              ? "bg-ink/10"
              : "bg-white/8",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 text-sm font-semibold leading-5">{label}</span>
    </button>
  );
}
