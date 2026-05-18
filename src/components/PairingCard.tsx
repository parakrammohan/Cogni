import { Check, Copy, Link2, Loader2, RotateCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client";
import * as pairingApi from "../api/pairing";
import { useAuth } from "../auth/AuthContext";

/**
 * Symmetric pairing card.
 *
 * Pairing is two-way:
 *   - Either side may generate an invite code.
 *   - The other side keys it in to pair.
 *   - The redeemer must be of the opposite role; the backend enforces it.
 *
 * The same UI works for both caregivers and patients. Code copy +
 * countdown + unpair are all here. Generating a new code invalidates
 * the previous one on the server (15-min TTL, single active code per
 * inviter), so a stolen / leaked code goes stale fast.
 */
export function PairingCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<pairingApi.PairingStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invite, setInvite] = useState<pairingApi.InviteCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const s = await pairingApi.status();
      setStatus(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't load pairing status.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live "expires in" countdown
  useEffect(() => {
    if (!invite) return;
    const handle = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [invite]);

  if (!user) return null;

  const pairings = status?.pairings ?? [];
  const partnerLabel = user.role === "caregiver" ? "patient" : "caregiver";

  const generate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setInvite(await pairingApi.createInvite());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't generate invite code.");
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
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

  const unpair = async (patientId: string) => {
    if (!confirm("Break this pairing?")) return;
    setBusy(true);
    setError(null);
    try {
      // Caregiver must specify patient_id; patient just calls without.
      await pairingApi.unpair(user.role === "caregiver" ? { patient_id: patientId } : {});
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
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — let user copy manually */
    }
  };

  const inviteExpiresIn =
    invite && nowMs
      ? Math.max(0, Math.round((new Date(invite.expires_at).getTime() - nowMs) / 1000))
      : 0;
  const inviteExpired = invite ? inviteExpiresIn === 0 : false;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-(--shadow-soft)">
      <div className="mb-4 flex items-center gap-2">
        <Users size={14} className="text-slate-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Pairing
        </h2>
      </div>

      {/* Current pairings — explicit loading state so we don't flash
          "not paired" before the status request has resolved. */}
      {!loaded ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Checking pairing status…
        </p>
      ) : pairings.length === 0 ? (
        <p className="text-sm text-slate-600">
          You aren&apos;t paired yet. Either generate a code below for your{" "}
          {partnerLabel} to use, or enter a code they shared with you.
        </p>
      ) : (
        <ul className="space-y-2">
          {pairings.map((p) => (
            <li
              key={p.pairing_id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  Paired with {p.partner.display_name}
                </p>
                <p className="truncate text-xs text-slate-600">
                  @{p.partner.username} ·{" "}
                  <span className="capitalize">{p.partner.role}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => unpair(p.partner.id)}
                disabled={busy}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Unpair
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Generate + redeem — always available; both sides are symmetric */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Share your code</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Generate a code your {partnerLabel} can type into their app. Codes
            expire after 15 minutes and generating a new one cancels the old.
          </p>
          {invite && !inviteExpired ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center font-mono text-xl font-bold tracking-[0.4em] text-slate-900">
                  {invite.code}
                </code>
                <button
                  type="button"
                  onClick={copyInvite}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Expires in{" "}
                <span className="font-mono">
                  {Math.floor(inviteExpiresIn / 60)
                    .toString()
                    .padStart(1, "0")}
                  :{(inviteExpiresIn % 60).toString().padStart(2, "0")}
                </span>
                {" · "}
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900 disabled:opacity-50"
                >
                  <RotateCw size={11} /> regenerate
                </button>
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Link2 size={14} />
              {inviteExpired ? "Generate new code" : "Generate code"}
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Enter their code
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Type the 6-character code your {partnerLabel} shared with you.
            Codes are case-insensitive.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="ABC123"
              maxLength={12}
              className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-center font-mono text-lg font-semibold tracking-[0.3em] text-slate-900 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
            <button
              type="button"
              onClick={redeem}
              disabled={busy || codeInput.trim().length < 4}
              className="rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Pair
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}
