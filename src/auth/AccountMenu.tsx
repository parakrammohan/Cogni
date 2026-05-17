import { LogOut, User2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cx } from "../lib/utils";
import { useAuth } from "./AuthContext";

/** Floating account chip rendered by AuthGate when authenticated.
 *  Sits in the top-right corner above the existing app shell so we
 *  don't have to surgically modify App.tsx to wire it in. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!user) return null;

  const initials = (user.display_name || user.username)
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="fixed right-4 top-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(
          "flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur",
          "hover:border-slate-300 hover:bg-white",
        )}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 text-[10px] font-semibold text-white"
        >
          {initials || <User2 size={12} />}
        </span>
        <span className="hidden sm:inline">{user.display_name}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          {user.role}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-(--shadow-elevated)"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Signed in as
            </p>
            <p className="mt-0.5 truncate font-medium text-slate-900">{user.display_name}</p>
            <p className="truncate text-xs text-slate-500">@{user.username}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={14} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
