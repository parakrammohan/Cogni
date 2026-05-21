import { AnimatePresence, motion } from "framer-motion";
import { Bell, LogOut, Menu, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar } from "../ui/Avatar";
import Badge from "../ui/Badge";
import { LANG_LABELS, SUPPORTED_LANGS, setLanguage, type Lang } from "../../i18n/config";
import { cx } from "../../lib/utils";

interface TopBarProps {
  title: string;
  subtitle?: string;
  modeLabel: string;
  notificationCount: number;
  onBellClick: () => void;
  /** Mobile-only: tapping opens the drawer or focuses the bottom nav */
  onMobileMenu?: () => void;
  /** Profile button (top-right). When omitted, no profile button renders. */
  profile?: {
    /** Auth user's display name — shown in the dropdown header. */
    name: string;
    /** Auth username + role for the dropdown's identity card. */
    username?: string;
    role?: string;
    /** Optional photo URL for the avatar (rare — most users don't have one). */
    photo?: string;
    /** Navigate to the role-appropriate Profile scene. */
    onOpenProfile: () => void;
    /** Sign-out handler. */
    onSignOut: () => void;
  };
}

export function TopBar({
  title,
  subtitle,
  modeLabel,
  notificationCount,
  onBellClick,
  onMobileMenu,
  profile,
}: TopBarProps) {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const currentLang = (i18n.language as Lang) || "en";

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const initialFragment = (profile?.name ?? "").trim();
  const placeholderName = initialFragment.length ? initialFragment : "Account";

  return (
    <header
      className={cx(
        "sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-xl",
        "lg:px-6 lg:py-4",
      )}
    >
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
      </div>

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${title}|${subtitle ?? ""}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <h1 className="truncate font-display text-lg font-semibold text-slate-900 sm:text-xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs uppercase tracking-wider text-slate-500 sm:text-xs">
                {subtitle}
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <Badge tone="info" className="hidden sm:inline-flex">
          {modeLabel}
        </Badge>
        <motion.button
          type="button"
          onClick={onBellClick}
          aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ""}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className={cx(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
            notificationCount > 0
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100",
          )}
        >
          <Bell size={16} aria-hidden />
          {notificationCount > 0 ? (
            <motion.span
              key={notificationCount}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white"
            >
              {notificationCount > 9 ? "9+" : notificationCount}
            </motion.span>
          ) : null}
        </motion.button>

        {/* Account dropdown — anchored to the avatar in the top-right. */}
        {profile ? (
          <div ref={menuRef} className="relative">
            <motion.button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-slate-200 transition hover:ring-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <Avatar name={placeholderName} src={profile.photo} size="sm" hue="cyan" />
            </motion.button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-(--shadow-elevated)"
              >
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Signed in as
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                    {profile.name || "—"}
                  </p>
                  {profile.username || profile.role ? (
                    <p className="truncate text-xs text-slate-500">
                      {profile.username ? `@${profile.username}` : ""}
                      {profile.username && profile.role ? " · " : ""}
                      {profile.role}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    profile.onOpenProfile();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <UserIcon size={14} aria-hidden /> {t("nav.profile")}
                </button>
                {/* Language picker — always reachable from any scene's
                    top-right menu, so a user who lands in the wrong
                    language can always escape without hunting for the
                    Profile page. */}
                <div className="border-t border-slate-100 px-4 py-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {t("common.language")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUPPORTED_LANGS.map((code) => {
                      const active = currentLang === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setLanguage(code)}
                          aria-pressed={active}
                          className={cx(
                            "rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                            active
                              ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {LANG_LABELS[code]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    profile.onSignOut();
                  }}
                  className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <LogOut size={14} aria-hidden /> {t("common.signOut")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
