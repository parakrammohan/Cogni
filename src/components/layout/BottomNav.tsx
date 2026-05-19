import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useState, type ComponentType, type SVGProps } from "react";

import { cx } from "../../lib/utils";

export interface BottomNavItem<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  hint?: string;
}

interface BottomNavProps<T extends string> {
  items: readonly BottomNavItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Optional badge count for an item (e.g. alerts) */
  badges?: Partial<Record<T, number>>;
}

/**
 * Mobile bottom nav with overflow handling.
 *
 *   - If items.length <= 5, renders all items as tabs.
 *   - If items.length > 5, renders the first 4 as tabs plus a "More" entry
 *     that opens a bottom sheet listing the remaining items. Same pattern as
 *     iOS UITabBar's More tab and Material's bottom-nav overflow.
 *
 * Every item stays reachable on every screen size — we never silently drop
 * routes from mobile.
 */
const PRIMARY_TABS = 4;

export function BottomNav<T extends string>({
  items,
  active,
  onChange,
  badges,
}: BottomNavProps<T>) {
  const overflow = items.length > 5;
  const primary = overflow ? items.slice(0, PRIMARY_TABS) : items;
  const overflowItems = overflow ? items.slice(PRIMARY_TABS) : [];
  const moreActive = overflow && overflowItems.some((item) => item.id === active);
  const moreBadge = overflow
    ? overflowItems.reduce((sum, item) => sum + (badges?.[item.id] ?? 0), 0)
    : 0;

  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 left-0 right-0 z-[1050] border-t border-slate-200 bg-white/85 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl shadow-[0_-1px_0_rgba(15,23,42,0.04),0_-12px_36px_rgba(15,23,42,0.06)]"
      >
        <ul className="flex w-full items-stretch justify-around gap-1">
          {primary.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            const badge = badges?.[item.id];
            return (
              <li key={item.id} className="min-w-0 flex-1">
                <NavButton
                  isActive={isActive}
                  onClick={() => onChange(item.id)}
                  ariaLabel={item.label}
                  badge={badge}
                  showActiveIndicator
                >
                  <Icon size={24} />
                </NavButton>
              </li>
            );
          })}
          {overflow ? (
            <li className="min-w-0 flex-1">
              <NavButton
                isActive={moreActive}
                onClick={() => setSheetOpen(true)}
                ariaLabel="More"
                badge={moreBadge > 0 ? moreBadge : undefined}
                showActiveIndicator={false}
              >
                <MoreHorizontal size={24} />
              </NavButton>
            </li>
          ) : null}
        </ul>
      </nav>

      <MoreSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        items={overflowItems}
        active={active}
        onChange={(id) => {
          onChange(id);
          setSheetOpen(false);
        }}
        badges={badges}
      />
    </>
  );
}

function NavButton({
  isActive,
  onClick,
  ariaLabel,
  badge,
  showActiveIndicator,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  ariaLabel: string;
  badge?: number;
  showActiveIndicator: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      aria-label={ariaLabel}
      className={cx(
        "group relative flex w-full items-center justify-center rounded-xl px-2 py-2 transition",
        isActive
          ? "text-cyan-700"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      <span
        className={cx(
          "relative flex h-11 w-11 items-center justify-center rounded-xl transition",
          isActive ? "bg-cyan-50 text-cyan-700" : "text-slate-500",
        )}
        aria-hidden
      >
        {children}
        {badge && badge > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      {showActiveIndicator && isActive ? (
        <motion.span
          layoutId="bottomnav-active-indicator"
          aria-hidden
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="absolute -top-px left-1/2 -ml-4 h-0.5 w-8 rounded-full bg-cyan-600"
        />
      ) : null}
    </button>
  );
}

function MoreSheet<T extends string>({
  open,
  onOpenChange,
  items,
  active,
  onChange,
  badges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ReadonlyArray<BottomNavItem<T>>;
  active: T;
  onChange: (id: T) => void;
  badges?: Partial<Record<T, number>>;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[1100] bg-slate-900/40 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="fixed inset-x-0 bottom-0 z-[1100] max-h-[80vh] overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-(--shadow-elevated)"
              >
                <div className="mx-auto mt-3 mb-2 h-1 w-12 rounded-full bg-slate-200" aria-hidden />
                <DialogPrimitive.Title className="px-5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  More pages
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Additional navigation
                </DialogPrimitive.Description>
                <ul className="grid gap-1 px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.id;
                    const badge = badges?.[item.id];
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onChange(item.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={cx(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                            isActive
                              ? "bg-cyan-50 text-cyan-800"
                              : "text-slate-700 hover:bg-slate-50",
                          )}
                        >
                          <span
                            className={cx(
                              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
                              isActive
                                ? "bg-cyan-100 text-cyan-700"
                                : "bg-slate-50 text-slate-600",
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
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="block truncate text-xs text-slate-500">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                          <ChevronRight size={16} className="text-slate-400" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
