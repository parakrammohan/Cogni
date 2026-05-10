import { motion } from "framer-motion";
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
        "fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/85 px-1 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5 backdrop-blur-xl shadow-[0_-1px_0_rgba(15,23,42,0.04),0_-12px_36px_rgba(15,23,42,0.06)] sm:px-2 sm:pt-2",
      )}
    >
      <ul className="flex w-full items-stretch justify-around gap-0.5 sm:gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const badge = badges?.[item.id];
          return (
            <li key={item.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                className={cx(
                  "group relative flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition sm:gap-1 sm:px-2 sm:py-2 sm:text-[11px]",
                  isActive
                    ? "text-cyan-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <span
                  className={cx(
                    "relative flex h-8 w-8 items-center justify-center rounded-xl transition sm:h-9 sm:w-9",
                    isActive ? "bg-cyan-50 text-cyan-700" : "text-slate-500",
                  )}
                  aria-hidden
                >
                  <Icon size={18} />
                  {badge && badge > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                <span className="block w-full truncate text-center leading-tight">
                  {item.label}
                </span>
                {isActive ? (
                  <motion.span
                    layoutId="bottomnav-active-indicator"
                    aria-hidden
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute -top-px left-1/2 -ml-4 h-0.5 w-8 rounded-full bg-cyan-600"
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
