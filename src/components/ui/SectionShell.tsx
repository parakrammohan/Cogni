import type { ReactNode } from "react";

import { cx } from "../../lib/utils";

interface SectionShellProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  light?: boolean;
}

export default function SectionShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  light = false,
}: SectionShellProps) {
  return (
    <section
      className={cx(
        "glass noise relative overflow-hidden rounded-[30px] border p-5 shadow-[var(--shadow-halo)] md:p-6",
        light
          ? "border-slate-300/70 bg-mist/90 text-ink"
          : "border-white/10 bg-slate-950/55 text-mist",
      )}
    >
      <div
        className={cx(
          "pointer-events-none absolute inset-0",
          light
            ? "bg-[radial-gradient(circle_at_top_right,rgba(13,23,32,0.08),transparent_34%),radial-gradient(circle_at_left,rgba(109,226,255,0.12),transparent_26%)]"
            : "bg-[radial-gradient(circle_at_top_right,rgba(109,226,255,0.12),transparent_30%),radial-gradient(circle_at_left,rgba(255,111,77,0.12),transparent_24%)]",
        )}
      />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="max-w-2xl">
            <div
              className={cx(
                "mb-2 text-[11px] font-semibold uppercase tracking-[0.35em]",
                light ? "text-slate-500" : "text-slate-400",
              )}
            >
              {eyebrow}
            </div>
            <h2
              className={cx(
                "font-display text-2xl leading-tight md:text-3xl",
                light ? "text-ink" : "text-white",
              )}
            >
              {title}
            </h2>
            {description ? (
              <p
                className={cx(
                  "mt-2 max-w-3xl text-sm leading-6 md:text-base",
                  light ? "text-slate-600" : "text-slate-300",
                )}
              >
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
