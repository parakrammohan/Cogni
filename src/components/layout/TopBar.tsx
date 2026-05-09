import { Bell, Menu, Radar } from "lucide-react";

import Badge from "../ui/Badge";
import { cx } from "../../lib/utils";

interface TopBarProps {
  title: string;
  subtitle?: string;
  modeLabel: string;
  alertCount: number;
  /** Mobile-only: tapping opens the drawer or focuses the bottom nav */
  onMobileMenu?: () => void;
}

/**
 * Slim sticky top bar. On desktop, the brand sits in the sidebar so this
 * shows the page title; on mobile, we duplicate the brand for affordance.
 */
export function TopBar({ title, subtitle, modeLabel, alertCount, onMobileMenu }: TopBarProps) {
  return (
    <header
      className={cx(
        "sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-xl",
        "lg:px-6 lg:py-4",
      )}
    >
      {/* Mobile-only menu / brand */}
      <div className="flex items-center gap-2 lg:hidden">
        {onMobileMenu ? (
          <button
            type="button"
            onClick={onMobileMenu}
            aria-label="Open navigation"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Menu size={18} aria-hidden />
          </button>
        ) : null}
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-sm">
          <Radar size={16} aria-hidden />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-semibold text-slate-900 sm:text-xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-[11px] uppercase tracking-wider text-slate-500 sm:text-xs">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Badge tone="info" className="hidden sm:inline-flex">
          {modeLabel}
        </Badge>
        <span
          className={cx(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600",
            alertCount > 0 ? "bg-red-50 text-red-600" : "bg-slate-50",
          )}
          aria-label={`${alertCount} alerts`}
        >
          <Bell size={16} aria-hidden />
          {alertCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          ) : null}
        </span>
      </div>
    </header>
  );
}
