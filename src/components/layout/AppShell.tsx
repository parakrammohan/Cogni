import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";

import { BottomNav, type BottomNavItem } from "./BottomNav";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { TopBar } from "./TopBar";
import { cx } from "../../lib/utils";

interface AppShellProps<T extends string> {
  items: ReadonlyArray<SidebarItem<T>>;
  active: T;
  onChange: (id: T) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  badges?: Partial<Record<T, number>>;
  modeLabel: string;
  notificationCount: number;
  onBellClick: () => void;
  pageTitle: string;
  pageSubtitle?: string;
  onOpenGuide: () => void;
  onOpenParameters: () => void;
  children: ReactNode;
}

/**
 * Adaptive shell.
 *  Desktop (lg+): collapsible left sidebar + sticky topbar + main content area.
 *  Mobile:        sticky topbar + content + bottom navigation. The Parameters
 *                 button floats bottom-right above the bottom nav.
 *
 * Sidebar items are reused by BottomNav, so the two stay in sync.
 */
export function AppShell<T extends string>({
  items,
  active,
  onChange,
  collapsed,
  onToggleCollapsed,
  badges,
  modeLabel,
  notificationCount,
  onBellClick,
  pageTitle,
  pageSubtitle,
  onOpenGuide,
  onOpenParameters,
  children,
}: AppShellProps<T>) {
  // Mobile bottom nav shows only items flagged `mobilePrimary !== false` so a
  // 7-item desktop sidebar doesn't crush a 360px-wide phone screen.
  const bottomNavItems: ReadonlyArray<BottomNavItem<T>> = items
    .filter((item) => item.mobilePrimary !== false)
    .map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
    }));

  // Desktop content offset accounts for sidebar width
  const contentOffset = collapsed ? "lg:pl-[76px]" : "lg:pl-64";

  return (
    <div className="relative min-h-screen">
      <Sidebar
        items={items}
        active={active}
        onChange={onChange}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        badges={badges}
        modeLabel={modeLabel}
        onOpenGuide={onOpenGuide}
        onOpenParameters={onOpenParameters}
      />

      <div className={cx("flex min-h-screen flex-col transition-[padding] duration-300", contentOffset)}>
        <TopBar
          title={pageTitle}
          subtitle={pageSubtitle}
          modeLabel={modeLabel}
          notificationCount={notificationCount}
          onBellClick={onBellClick}
        />

        <main
          id="main-content"
          className="flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav (hidden on lg+) */}
      <div className="lg:hidden">
        <BottomNav
          items={bottomNavItems}
          active={active}
          onChange={onChange}
          badges={badges}
        />
      </div>

      {/* Floating Parameters button — visible on all sizes; positioned above mobile nav */}
      <ParametersFab onClick={onOpenParameters} />
    </div>
  );
}

function ParametersFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open parameters"
      className={cx(
        "fixed right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-(--shadow-elevated) transition hover:bg-slate-800",
        // Position above the bottom nav on mobile, classic bottom-right on desktop
        "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-6 lg:right-6",
      )}
    >
      <Settings2 size={16} aria-hidden />
      <span className="hidden sm:inline">Parameters</span>
    </button>
  );
}
