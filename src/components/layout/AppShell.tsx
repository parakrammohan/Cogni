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
  profile?: {
    name: string;
    username?: string;
    role?: string;
    photo?: string;
    onOpenProfile: () => void;
    onSignOut: () => void;
  };
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
  profile,
  children,
}: AppShellProps<T>) {
  // Mobile bottom nav receives every item; it splits the first N into a tab
  // bar and the rest into a "More" overflow sheet.
  const bottomNavItems: ReadonlyArray<BottomNavItem<T>> = items.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    hint: item.hint,
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

      <div className={cx("flex h-[100dvh] flex-col transition-[padding] duration-300", contentOffset)}>
        <TopBar
          title={pageTitle}
          subtitle={pageSubtitle}
          modeLabel={modeLabel}
          notificationCount={notificationCount}
          onBellClick={onBellClick}
          profile={profile}
        />

        {/* Main fills the remaining height after the top bar. `min-h-0`
            lets flex children honour `flex-1` properly. The inner wrapper
            handles scrolling: scenes whose content overflows scroll
            within it, while scenes that want to fit the viewport wrap
            themselves in `flex h-full flex-col` to clamp to the wrapper's
            height. `pb-24` on mobile leaves room for the bottom nav. */}
        <main
          id="main-content"
          className="min-h-0 flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-6"
        >
          <div className="h-full overflow-y-auto">{children}</div>
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
    </div>
  );
}
