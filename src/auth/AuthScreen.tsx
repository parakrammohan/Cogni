import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { cx } from "../lib/utils";
import { useAuth } from "./AuthContext";
import type { Role } from "./types";

type Mode = "login" | "signup";

const DEMO_CAREGIVER = { username: "demo-caregiver", password: "demo-pass-1234" };
const DEMO_PATIENT = { username: "demo-patient", password: "demo-pass-1234" };

/** Combined login + signup screen rendered by AuthGate when no token. */
export function AuthScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("caregiver");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fillDemo = (preset: typeof DEMO_CAREGIVER) => {
    setMode("login");
    setUsername(preset.username);
    setPassword(preset.password);
    setConfirmPassword(preset.password);
    setError(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login({ username, password });
      } else {
        await signup({
          username,
          password,
          role,
          display_name: displayName || username,
          invite_code: inviteCode ? inviteCode : undefined,
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-cyan-50 via-sky-50 to-white px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-(--shadow-elevated)">
        <header className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-slate-900">CogniTrack</h1>
          <p className="mt-1 text-sm text-slate-600">
            {mode === "login"
              ? "Sign in to your account."
              : "Create a new caregiver or patient account."}
          </p>
        </header>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field label="Username">
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCx}
              placeholder="your-username"
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCx}
              placeholder="••••••••"
            />
          </Field>

          {mode === "signup" && (
            <>
              <Field label="Confirm password">
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputCx}
                  placeholder="Re-enter password"
                />
              </Field>
              <Field label="Display name">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCx}
                  placeholder="Your name"
                />
              </Field>
              <Field label="Role">
                <div className="grid grid-cols-2 gap-2">
                  {(["caregiver", "patient"] as const).map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={cx(
                        "rounded-xl border px-3 py-2 text-sm font-medium capitalize transition",
                        role === r
                          ? "border-cyan-500 bg-cyan-50 text-cyan-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Invite code (optional)">
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className={inputCx}
                  placeholder="X7K2QA"
                  maxLength={12}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  If your {role === "patient" ? "caregiver" : "patient"} shared a code with
                  you, paste it here and you&apos;ll be paired on signup.
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
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="font-semibold text-cyan-700 hover:text-cyan-900"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button
                type="button"
                className="font-semibold text-cyan-700 hover:text-cyan-900"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
          <p className="font-semibold uppercase tracking-wider text-slate-500">Demo accounts</p>
          <p className="mt-1">
            Two seeded accounts are available for quick testing:
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              <button
                type="button"
                onClick={() => fillDemo(DEMO_CAREGIVER)}
                className="font-mono text-cyan-700 hover:underline"
              >
                demo-caregiver
              </button>{" "}
              / <code className="font-mono">demo-pass-1234</code>
            </li>
            <li>
              <button
                type="button"
                onClick={() => fillDemo(DEMO_PATIENT)}
                className="font-mono text-cyan-700 hover:underline"
              >
                demo-patient
              </button>{" "}
              / <code className="font-mono">demo-pass-1234</code>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const inputCx =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
