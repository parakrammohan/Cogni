import { AlertTriangle, Check, KeyRound, Pencil, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { LanguagePicker } from "../components/LanguagePicker";
import { useAuth } from "./AuthContext";

/**
 * Account settings card — change display name, username, and password.
 * Used inside both Profile scenes (patient + caregiver).
 *
 * The card itself is read-only by default and reveals editable forms
 * only when the user opts in, so the surface stays calm.
 */
export function AccountSettingsCard() {
  const { user, updateMe, changePassword, deleteAccount } = useAuth();
  const { t } = useTranslation();
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  if (!user) return null;
  return (
    <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
      <div className="flex items-center gap-2">
        <KeyRound size={14} className="text-slate-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t("account.title")}
        </h2>
      </div>

      {/* Language picker — always visible regardless of edit mode so the
          user can escape a wrong language at any time. */}
      <LanguagePicker variant="bare" className="pb-1" />

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
              <p className="text-xs uppercase tracking-wider text-slate-500">
                {t("accountSettingsCard.displayName")}
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">
                {user.display_name || "—"}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-500">
                {t("accountSettingsCard.username")}
              </p>
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
              <p className="text-xs uppercase tracking-wider text-slate-500">
                {t("accountSettingsCard.password")}
              </p>
              <p className="mt-0.5 text-sm text-slate-700">
                {t("accountSettingsCard.argon2idHashedChangingItSignsOut")}
              </p>
            </>
          }
          actionLabel="Change password"
          onAction={() => setEditingPassword(true)}
        />
      )}

      <hr className="border-slate-100" />

      <DangerZone
        userRole={user.role}
        username={user.username}
        confirming={confirmingDelete}
        onStart={() => setConfirmingDelete(true)}
        onCancel={() => setConfirmingDelete(false)}
        onDelete={(body) => deleteAccount(body)}
      />
    </section>
  );
}
function DangerZone({
  userRole,
  username,
  confirming,
  onStart,
  onCancel,
  onDelete,
}: {
  userRole: "caregiver" | "patient";
  username: string;
  confirming: boolean;
  onStart: () => void;
  onCancel: () => void;
  onDelete: (body: { current_password: string; username_confirmation: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [typedUsername, setTypedUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consequence =
    userRole === "caregiver"
      ? t("accountSettingsCard.yourAccountAndEveryRecordYouOwnA")
      : t("accountSettingsCard.yourAccountAndEveryRecordAboutYo");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onDelete({
        current_password: password,
        username_confirmation: typedUsername,
      });
      // No further UI — deleteAccount flips status to anonymous and
      // the AuthGate swaps to the login screen.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("accountSettingsCard.couldNotDeleteTheAccount"),
      );
      setBusy(false);
    }
  }
  if (!confirming) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
            <AlertTriangle size={16} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
              {t("accountSettingsCard.dangerZone")}
            </p>
            <p className="mt-0.5 text-sm text-slate-700">
              {t("accountSettingsCard.permanentlyDeleteThisAccountAndE")}
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          >
            <Trash2 size={14} aria-hidden />
            {t("accountSettingsCard.deleteAccount")}
          </button>
        </div>
      </div>
    );
  }
  const canSubmit =
    password.length >= 1 && typedUsername.trim().toLowerCase() === username && !busy;
  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4"
    >
      <div className="flex items-start gap-2 text-red-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <p className="text-sm font-semibold">{t("accountSettingsCard.confirmPermanentDeletion")}</p>
      </div>
      <p className="text-xs leading-5 text-red-900/90">{consequence}</p>
      <label className="block">
        <span className="block text-xs font-semibold text-red-900">
          {t("accountSettingsCard.currentPassword")}
        </span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-red-900">
          {t("accountSettingsCard.typeYourUsername")}
          <span className="font-mono">{username}</span>
          {t("accountSettingsCard.toConfirm")}
        </span>
        <input
          type="text"
          autoComplete="off"
          required
          value={typedUsername}
          onChange={(e) => setTypedUsername(e.target.value)}
          className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
      </label>
      {error ? (
        <p className="rounded-lg bg-white px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          <Trash2 size={14} aria-hidden />
          {busy ? t("accountSettingsCard.deleting") : t("accountSettingsCard.permanentlyDelete")}
        </button>
        <button
          type="button"
          onClick={() => {
            setPassword("");
            setTypedUsername("");
            setError(null);
            onCancel();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <X size={14} aria-hidden />
          {t("accountSettingsCard.cancel")}
        </button>
      </div>
    </form>
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
  const { t } = useTranslation();
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
  const { t } = useTranslation();
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
      setError(err instanceof ApiError ? err.detail : t("accountSettingsCard.couldnTSaveChanges"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {t("accountSettingsCard.displayName")}
        </span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={120}
          required
          className={inputCx}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {t("accountSettingsCard.username")}
        </span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
          minLength={3}
          maxLength={64}
          required
          className={inputCx + " font-mono"}
        />
        <span className="mt-1 block text-xs text-slate-500">
          {t("accountSettingsCard.lowercaseLettersDigitsAnd")} <code>-</code> / <code>_</code>{" "}
          {t("accountSettingsCard.onlyMustBeUnique")}
        </span>
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Check size={12} />{" "}
          {busy ? t("accountSettingsCard.saving") : t("accountSettingsCard.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <X size={12} /> {t("accountSettingsCard.cancel")}
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
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError(t("accountSettingsCard.newPasswordAndConfirmationDonTMa"));
      return;
    }
    if (next.length < 8) {
      setError(t("accountSettingsCard.newPasswordMustBeAtLeast8Charact"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        current_password: current,
        new_password: next,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : t("accountSettingsCard.couldnTChangePassword"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {t("accountSettingsCard.currentPassword")}
        </span>
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
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {t("accountSettingsCard.newPassword")}
        </span>
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
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {t("accountSettingsCard.confirmNewPassword")}
        </span>
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
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Check size={12} />{" "}
          {busy ? t("accountSettingsCard.saving") : t("accountSettingsCard.updatePassword")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <X size={12} /> {t("accountSettingsCard.cancel")}
        </button>
      </div>
    </form>
  );
}
const inputCx =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
