import { LayoutGroup, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, HelpCircle, Radar, Settings2 } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { cx } from "../../lib/utils";
import { useTranslation } from "react-i18next";
export interface SidebarItem<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<
    SVGProps<SVGSVGElement> & {
      size?: number;
    }
  >;
  hint?: string;
}
interface SidebarProps<T extends string> {
  items: ReadonlyArray<SidebarItem<T>>;
  active: T;
  onChange: (id: T) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  badges?: Partial<Record<T, number>>;
  onOpenGuide: () => void;
  onOpenParameters: () => void;
  /** Mode label shown at the bottom (e.g. "Patient" / "Caregiver") */
  modeLabel: string;
}

/**
 * Desktop-only collapsible left sidebar. Mobile uses BottomNav instead.
 * Renders only at `lg+` breakpoints; hidden below.
 */
export function Sidebar<T extends string>({
  items,
  active,
  onChange,
  collapsed,
  onToggleCollapsed,
  badges,
  onOpenGuide,
  onOpenParameters,
  modeLabel,
}: SidebarProps<T>) {
  const { t } = useTranslation();
  const targetWidth = collapsed ? 76 : 256;
  return (
    <motion.aside
      aria-label={t("sidebar.primaryNavigation")}
      initial={false}
      animate={{
        width: targetWidth,
      }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 28,
        mass: 0.8,
      }}
      className={cx(
        "fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-slate-200 bg-white/95 backdrop-blur lg:flex",
      )}
    >
      {/* Brand */}
      <div
        className={cx(
          "flex items-center gap-2 border-b border-slate-200 py-4",
          collapsed ? "flex-col px-2" : "justify-between px-4",
        )}
      >
        <button
          type="button"
          onClick={() => {
            const first = items[0];
            if (first) onChange(first.id);
          }}
          className="flex items-center gap-3 text-left transition hover:opacity-80"
          aria-label={t("sidebar.cogniHome")}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-sm">
            <Radar size={18} aria-hidden />
          </span>
          <span className={cx("min-w-0", collapsed ? "hidden" : "block")}>
            <span className="block truncate font-display text-base font-semibold leading-tight text-slate-900">
              {t("sidebar.cogni")}
            </span>
            <span className="block truncate text-xs uppercase tracking-wider text-cyan-700">
              {modeLabel} mode
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <LayoutGroup id="sidebar-nav">
          <ul className="space-y-0.5">
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
                    title={collapsed ? item.label : undefined}
                    className={cx(
                      "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      isActive
                        ? "text-cyan-700"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    {/* Animated active surface — slides between items */}
                    {isActive ? (
                      <motion.span
                        layoutId="sidebar-active-bg"
                        aria-hidden
                        className="absolute inset-0 rounded-xl bg-cyan-50"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    ) : null}
                    {isActive ? (
                      <motion.span
                        layoutId="sidebar-active-bar"
                        aria-hidden
                        className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-cyan-600"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    ) : null}
                    <span
                      className={cx(
                        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? "bg-cyan-100 text-cyan-700"
                          : "text-slate-500 group-hover:text-slate-700",
                      )}
                      aria-hidden
                    >
                      <Icon size={18} />
                      {badge && badge > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      ) : null}
                    </span>
                    <span className={cx("relative min-w-0 flex-1 truncate", collapsed && "hidden")}>
                      <span className="block">{item.label}</span>
                      {item.hint ? (
                        <span className="block truncate text-xs font-normal text-slate-500">
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
      </nav>

      {/* Footer actions */}
      <div className="border-t border-slate-200 p-2">
        <FooterButton
          icon={<Settings2 size={16} />}
          label={t("sidebar.parameters")}
          onClick={onOpenParameters}
          collapsed={collapsed}
        />
        <FooterButton
          icon={<HelpCircle size={16} />}
          label={t("sidebar.guide")}
          onClick={onOpenGuide}
          collapsed={collapsed}
        />
      </div>
    </motion.aside>
  );
}
function FooterButton({
  icon,
  label,
  onClick,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cx(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900",
        collapsed && "justify-center px-2",
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center text-slate-500" aria-hidden>
        {icon}
      </span>
      <span className={cx(collapsed && "hidden")}>{label}</span>
    </button>
  );
}
