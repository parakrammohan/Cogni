import type { ReactNode } from "react";

import { cx } from "../../lib/utils";

type Surface = "card" | "subtle" | "operations";

interface SectionShellProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /**
   * `card`: white surface (default — most panels).
   * `subtle`: muted slate-50 surface (use for nested sections).
   * `operations`: darker slate-900 surface for the caregiver "command" feel.
   * @deprecated use `surface` instead — kept for backwards compat.
   */
  light?: boolean;
  surface?: Surface;
}

const SURFACE_CLASSES: Record<Surface, string> = {
  card: "border-slate-200 bg-white text-slate-900",
  subtle: "border-slate-200 bg-slate-50 text-slate-900",
  operations: "border-slate-800 bg-slate-900 text-slate-100",
};

const ACCENT_CLASSES: Record<Surface, string> = {
  card: "bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.07),transparent_40%)]",
  subtle: "bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.05),transparent_40%)]",
  operations:
    "bg-[radial-gradient(circle_at_top_right,rgba(109,226,255,0.10),transparent_40%),radial-gradient(circle_at_left,rgba(255,111,77,0.10),transparent_30%)]",
};

const EYEBROW_CLASSES: Record<Surface, string> = {
  card: "text-slate-500",
  subtle: "text-slate-500",
  operations: "text-slate-400",
};

const DESCRIPTION_CLASSES: Record<Surface, string> = {
  card: "text-slate-600",
  subtle: "text-slate-600",
  operations: "text-slate-300",
};

export default function SectionShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  light: _legacyLight,
  surface = "card",
}: SectionShellProps) {
  // Suppress unused-warning for legacy prop while keeping API compatibility.
  void _legacyLight;
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-3xl border p-5 shadow-(--shadow-soft) md:p-6",
        SURFACE_CLASSES[surface],
      )}
    >
      <div className={cx("pointer-events-none absolute inset-0", ACCENT_CLASSES[surface])} />
      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="max-w-2xl">
            <div
              className={cx(
                "mb-1.5 text-xs font-semibold uppercase tracking-[0.18em]",
                EYEBROW_CLASSES[surface],
              )}
            >
              {eyebrow}
            </div>
            <h2 className="font-display text-2xl font-semibold leading-tight md:text-[1.7rem]">
              {title}
            </h2>
            {description ? (
              <p className={cx("mt-2 text-sm leading-6", DESCRIPTION_CLASSES[surface])}>
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
