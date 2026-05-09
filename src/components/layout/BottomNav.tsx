import type { ComponentType, SVGProps } from "react";

import { cx } from "../../lib/utils";

export interface BottomNavItem<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
}

interface BottomNavProps<T extends string> {
  items: readonly BottomNavItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Optional badge count for an item (e.g. alerts) */
  badges?: Partial<Record<T, number>>;
}

/**
 * Mobile-first navigation. Renders as a bottom tab bar on small screens and
 * a vertical rail on the right side on large screens. Tap targets are 56px
 * tall (above WCAG 44px minimum). Supports up to 5 items comfortably.
 */
export function BottomNav<T extends string>({
  items,
  active,
  onChange,
  badges,
}: BottomNavProps<T>) {
  return (
    <nav
      aria-label="Primary navigation"
      className={cx(
        // Mobile: fixed bottom bar with safe-area inset
        "fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/85 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl shadow-[0_-1px_0_rgba(15,23,42,0.04),0_-12px_36px_rgba(15,23,42,0.06)]",
        // Desktop: stacked rail on the right edge
        "lg:left-auto lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:w-auto lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white/95 lg:p-2 lg:pb-2 lg:shadow-(--shadow-elevated) lg:bottom-auto",
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around gap-1 lg:flex-col lg:max-w-none">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const badge = badges?.[item.id];
          return (
            <li key={item.id} className="flex-1 lg:flex-none">
              <button
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                className={cx(
                  "group relative flex w-full flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:text-sm",
                  isActive
                    ? "text-cyan-700"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
                )}
              >
                <span
                  className={cx(
                    "relative flex h-9 w-9 items-center justify-center rounded-xl transition lg:h-8 lg:w-8",
                    isActive ? "bg-cyan-50 text-cyan-700" : "text-slate-500",
                  )}
                  aria-hidden
                >
                  <Icon size={20} />
                  {badge && badge > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                <span className="leading-tight">{item.label}</span>
                {isActive ? (
                  <span
                    className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-cyan-600 lg:left-0 lg:top-1/2 lg:h-8 lg:w-0.5 lg:-translate-x-0 lg:-translate-y-1/2"
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
