import { useEffect, useRef, useState, type FormEvent } from "react";
import { FlaskConical, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { LanguagePicker } from "../components/LanguagePicker";
import { cx } from "../lib/utils";
import { useAuth } from "./AuthContext";
import type { Role } from "./types";
type Mode = "login" | "signup";

// Backend seeds four accounts in two pre-paired sets (see
// backend/app/seed.py). The "showcase" pair + the live-demo caregiver
// surface here; the live-demo patient is intentionally NOT advertised
// so passers-by can't grab the patient device mid-demo.
const SHARED_DEMO_PASSWORD = "demo-pass-1234";
interface DemoPreset {
  username: string;
  password: string;
  roleLabelKey: "auth.roleCaregiver" | "auth.rolePatient";
}
const DEMO_PRESETS: ReadonlyArray<DemoPreset> = [
  {
    username: "showcase-caregiver",
    password: SHARED_DEMO_PASSWORD,
    roleLabelKey: "auth.roleCaregiver",
  },
  {
    username: "showcase-patient",
    password: SHARED_DEMO_PASSWORD,
    roleLabelKey: "auth.rolePatient",
  },
  {
    username: "live-demo-caregiver",
    password: SHARED_DEMO_PASSWORD,
    roleLabelKey: "auth.roleCaregiver",
  },
];

/** Combined login + signup screen rendered by AuthGate when no token. */
export function AuthScreen() {
  const { login, signup } = useAuth();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("caregiver");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const demoRef = useRef<HTMLDivElement | null>(null);
  // Per-field validation. We deliberately don't use HTML5 required /
  // minLength / pattern attributes — those trigger the browser's native
  // tooltip (orange triangle + system-font copy that ignores the app's
  // styling and i18n). Instead we keep a small errors map, render
  // inline below each input, and clear an entry the moment the user
  // edits that field.
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    password?: string;
    confirmPassword?: string;
    inviteCode?: string;
  }>({});

  function clearField(key: keyof typeof fieldErrors) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  }

  function validate(): typeof fieldErrors {
    const errs: typeof fieldErrors = {};
    const u = username.trim();
    if (!u) errs.username = t("authScreen.usernameRequired");
    else if (u.length < 3) errs.username = t("authScreen.usernameTooShort");
    else if (u.length > 64) errs.username = t("authScreen.usernameTooLong");
    else if (!/^[a-z0-9_-]+$/i.test(u)) errs.username = t("authScreen.usernameInvalid");

    if (!password) errs.password = t("authScreen.passwordRequired");
    else if (password.length < 8) errs.password = t("authScreen.passwordTooShort");

    if (mode === "signup") {
      if (!confirmPassword) errs.confirmPassword = t("authScreen.confirmRequired");
      else if (password && confirmPassword !== password)
        errs.confirmPassword = t("auth.passwordsDontMatch");
      const code = inviteCode.trim();
      if (code && code.length < 4) errs.inviteCode = t("authScreen.inviteTooShort");
      else if (code && code.length > 12) errs.inviteCode = t("authScreen.inviteTooLong");
    }
    return errs;
  }

  // Close the demo-accounts popover on outside click. The popover lives
  // in a fixed-position container alongside the trigger button, so a
  // single ref on the outer container catches both.
  useEffect(() => {
    if (!demoOpen) return;
    function onClick(e: MouseEvent) {
      if (demoRef.current && !demoRef.current.contains(e.target as Node)) {
        setDemoOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [demoOpen]);

  const fillDemo = (preset: DemoPreset) => {
    setMode("login");
    setUsername(preset.username);
    setPassword(preset.password);
    setConfirmPassword(preset.password);
    setError(null);
    setDemoOpen(false);
  };
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login({
          username: username.trim(),
          password,
        });
      } else {
        await signup({
          username: username.trim(),
          password,
          role,
          display_name: displayName || username.trim(),
          invite_code: inviteCode.trim() || undefined,
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t("authScreen.somethingWentWrongTryAgain"));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-cyan-50 via-sky-50 to-white px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-(--shadow-elevated)">
        <header className="mb-6 flex flex-col items-start gap-3">
          <img src="/cogni_logo.svg" alt={t("auth.appName")} className="h-12 w-auto" />
          <p className="text-sm text-slate-600">{t("auth.tagline")}</p>
        </header>

        {/* Language picker before the form so anyone landing on this
            screen in a language they don't read can escape to one they
            do. Persists in localStorage. */}
        <LanguagePicker variant="bare" className="mb-5" />

        {/* noValidate disables the browser's default bubble tooltips;
            we do our own per-field validation + styled error rows. */}
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field label={t("auth.username")} error={fieldErrors.username}>
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearField("username");
              }}
              aria-invalid={fieldErrors.username ? true : undefined}
              className={fieldErrors.username ? inputErrorCx : inputCx}
              placeholder="your-username"
            />
          </Field>

          <Field label={t("auth.password")} error={fieldErrors.password}>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearField("password");
                // Editing the password may have invalidated a previously-
                // matching confirmation. Re-check on the fly to surface
                // the mismatch before the user submits.
                if (mode === "signup" && fieldErrors.confirmPassword) clearField("confirmPassword");
              }}
              aria-invalid={fieldErrors.password ? true : undefined}
              className={fieldErrors.password ? inputErrorCx : inputCx}
              placeholder="••••••••"
            />
          </Field>

          {mode === "signup" && (
            <>
              <Field label={t("auth.confirmPassword")} error={fieldErrors.confirmPassword}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearField("confirmPassword");
                  }}
                  aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                  className={fieldErrors.confirmPassword ? inputErrorCx : inputCx}
                  placeholder="••••••••"
                />
              </Field>
              <Field label={t("auth.displayName")}>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCx}
                  placeholder={t("auth.displayName")}
                />
              </Field>
              <Field label={t("auth.role")}>
                <div className="grid grid-cols-2 gap-2">
                  {(["caregiver", "patient"] as const).map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={cx(
                        "rounded-xl border px-3 py-2 text-sm font-medium transition",
                        role === r
                          ? "border-cyan-500 bg-cyan-50 text-cyan-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      {r === "caregiver" ? t("auth.roleCaregiver") : t("auth.rolePatient")}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t("auth.inviteCode")} error={fieldErrors.inviteCode}>
                <input
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value.toUpperCase());
                    clearField("inviteCode");
                  }}
                  aria-invalid={fieldErrors.inviteCode ? true : undefined}
                  className={fieldErrors.inviteCode ? inputErrorCx : inputCx}
                  placeholder="X7K2QA"
                  maxLength={12}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {t("authScreen.ifYour")} {role === "patient" ? "caregiver" : "patient"}{" "}
                  {t("authScreen.sharedACodeWithYouPasteItHereAnd")}
                </p>
              </Field>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} size="lg" className="mt-2">
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {mode === "login" ? t("auth.signInButton") : t("auth.signUpButton")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {mode === "login" ? (
            <>
              {t("auth.noAccount")}{" "}
              <button
                type="button"
                className="font-semibold text-cyan-700 hover:text-cyan-900"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
              >
                {t("auth.signUp")}
              </button>
            </>
          ) : (
            <>
              {t("auth.haveAccount")}{" "}
              <button
                type="button"
                className="font-semibold text-cyan-700 hover:text-cyan-900"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                {t("auth.signIn")}
              </button>
            </>
          )}
        </p>

      </div>

      {/* Demo accounts — floating FAB bottom-right. Tap to expand a
          small card listing the seeded credentials; tap a username to
          autofill the form and close the popover. Kept out of the main
          card so the sign-in surface stays uncluttered. */}
      <div ref={demoRef} className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
        {demoOpen ? (
          <div
            role="dialog"
            aria-label={t("authScreen.demoAccounts")}
            className="mb-3 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-elevated)"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {t("authScreen.demoAccounts")}
              </p>
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                aria-label={t("common.cancel")}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              {t("authScreen.seededAccountsAreAvailableFor")}
            </p>
            <ul className="mt-3 space-y-2">
              {DEMO_PRESETS.map((preset) => (
                <li key={preset.username}>
                  <button
                    type="button"
                    onClick={() => fillDemo(preset)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
                  >
                    <div className="font-mono text-sm font-semibold text-slate-900">
                      {preset.username}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t(preset.roleLabelKey)} ·{" "}
                      <code className="font-mono">{preset.password}</code>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setDemoOpen((v) => !v)}
          aria-expanded={demoOpen}
          aria-label={t("authScreen.demoAccounts")}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ring-1 ring-slate-700 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <FlaskConical size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}
const inputCx =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const inputErrorCx =
  "h-10 w-full rounded-xl border border-red-300 bg-red-50/50 px-3 text-sm text-slate-900 placeholder:text-red-300 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-xs font-medium text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
