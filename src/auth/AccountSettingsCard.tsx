import { Check, KeyRound, Pencil, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { useAuth } from "./AuthContext";

/**
 * Account settings card — change display name, username, and password.
 * Used inside both Profile scenes (patient + caregiver).
 *
 * The card itself is read-only by default and reveals editable forms
 * only when the user opts in, so the surface stays calm.
 */
export function AccountSettingsCard() {
  const { user, updateMe, changePassword } = useAuth();
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);

  if (!user) return null;

  return (
    <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
      <div className="flex items-center gap-2">
        <KeyRound size={14} className="text-slate-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Account settings
        </h2>
      </div>

      {editingIdentity ? (
        <IdentityForm
          initialUsername={user.username}
          initialDisplayName={user.display_name}
          onSave={async (next) => {
            await updateMe(next);
            setEditingIdentity(false);
          }}
          onCancel={() => setEditingIdentity(false)}
        />
      ) : (
        <Row
          left={
            <>
              <p className="text-xs uppercase tracking-wider text-slate-500">Display name</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">
                {user.display_name || "—"}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">Username</p>
              <p className="mt-0.5 text-sm font-mono text-slate-900">@{user.username}</p>
            </>
          }
          actionLabel="Edit identity"
          onAction={() => setEditingIdentity(true)}
        />
      )}

      <hr className="border-slate-100" />

      {editingPassword ? (
        <PasswordForm
          onSave={async (next) => {
            await changePassword(next);
            setEditingPassword(false);
          }}
          onCancel={() => setEditingPassword(false)}
        />
      ) : (
        <Row
          left={
            <>
              <p className="text-xs uppercase tracking-wider text-slate-500">Password</p>
              <p className="mt-0.5 text-sm text-slate-700">
                Argon2id-hashed. Changing it signs out every other device.
              </p>
            </>
          }
          actionLabel="Change password"
          onAction={() => setEditingPassword(true)}
        />
      )}
    </section>
  );
}

function Row({
  left,
  actionLabel,
  onAction,
}: {
  left: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">{left}</div>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Pencil size={12} /> {actionLabel}
      </button>
    </div>
  );
}

function IdentityForm({
  initialUsername,
  initialDisplayName,
  onSave,
  onCancel,
}: {
  initialUsername: string;
  initialDisplayName: string;
  onSave: (next: { username: string; display_name: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = username !== initialUsername || displayName !== initialDisplayName;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        username: username !== initialUsername ? username : initialUsername,
        display_name: displayName,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">Display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={120}
          required
          className={inputCx}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
          minLength={3}
          maxLength={64}
          required
          className={inputCx + " font-mono"}
        />
        <span className="mt-1 block text-xs text-slate-500">
          Lowercase letters, digits, and <code>-</code> / <code>_</code> only. Must be unique.
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Check size={12} /> {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <X size={12} /> Cancel
        </button>
      </div>
    </form>
  );
}

function PasswordForm({
  onSave,
  onCancel,
}: {
  onSave: (next: { current_password: string; new_password: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ current_password: current, new_password: next });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't change password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">Current password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className={inputCx}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          className={inputCx}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">Confirm new password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className={inputCx}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Check size={12} /> {busy ? "Saving…" : "Update password"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <X size={12} /> Cancel
        </button>
      </div>
    </form>
  );
}

const inputCx =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
