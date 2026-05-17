import { Copy, Link2, LogOut, User2, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";
import * as pairingApi from "../api/pairing";
import { cx } from "../lib/utils";
import { useAuth } from "./AuthContext";

/**
 * Floating account chip rendered by AuthGate when authenticated.
 * Hosts: user identity, pairing status, generate-invite / redeem flow,
 * sign-out.
 */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Pairing state — refreshed when the menu opens and after any action.
  const [status, setStatus] = useState<pairingApi.PairingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Caregiver flow
  const [invite, setInvite] = useState<pairingApi.InviteCode | null>(null);
  const [copied, setCopied] = useState(false);

  // Patient flow
  const [codeInput, setCodeInput] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await pairingApi.status());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't load pairing status.");
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

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

  const isCaregiver = user.role === "caregiver";
  const pairings = status?.pairings ?? [];

  const generateInvite = async () => {
    setBusy(true);
    setError(null);
    setInvite(null);
    setCopied(false);
    try {
      setInvite(await pairingApi.createInvite());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't generate invite code.");
    } finally {
      setBusy(false);
    }
  };

  const redeemCode = async () => {
    if (!codeInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await pairingApi.redeem(codeInput);
      setCodeInput("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't redeem code.");
    } finally {
      setBusy(false);
    }
  };

  const unpair = async (patientId?: string) => {
    if (!confirm("Break this pairing?")) return;
    setBusy(true);
    setError(null);
    try {
      await pairingApi.unpair(patientId ? { patient_id: patientId } : {});
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't unpair.");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — let the user copy manually */
    }
  };

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
          className="mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-(--shadow-elevated)"
        >
          {/* identity */}
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Signed in as
            </p>
            <p className="mt-0.5 truncate font-medium text-slate-900">{user.display_name}</p>
            <p className="truncate text-xs text-slate-500">@{user.username}</p>
          </div>

          {/* pairing */}
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Users size={12} /> Pairing
            </div>
            {pairings.length === 0 ? (
              <p className="text-sm text-slate-500">
                {isCaregiver ? "No patients paired yet." : "Not paired with a caregiver yet."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {pairings.map((p) => (
                  <li
                    key={p.pairing_id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {p.partner.display_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">@{p.partner.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => unpair(isCaregiver ? p.partner.id : undefined)}
                      disabled={busy}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Unpair
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {isCaregiver ? (
              <div className="mt-3">
                {invite ? (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                    <p className="text-xs text-slate-600">
                      Share this code with your patient. Expires in 24 hours.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 rounded-lg bg-white px-2.5 py-1.5 font-mono text-base font-semibold tracking-widest text-slate-900">
                        {invite.code}
                      </code>
                      <button
                        type="button"
                        onClick={copyInvite}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50"
                      >
                        <Copy size={12} /> {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={generateInvite}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Link2 size={12} /> Generate invite code
                  </button>
                )}
              </div>
            ) : pairings.length === 0 ? (
              <div className="mt-3 flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="Code"
                  maxLength={12}
                  className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm font-mono uppercase tracking-widest text-slate-900 placeholder:font-sans placeholder:text-xs placeholder:tracking-normal focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
                <button
                  type="button"
                  onClick={redeemCode}
                  disabled={busy || codeInput.trim().length < 4}
                  className="rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Pair
                </button>
              </div>
            ) : null}

            {error && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {error}
              </p>
            )}
          </div>

          {/* logout */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
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
