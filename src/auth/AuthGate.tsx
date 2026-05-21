import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AuthScreen } from "./AuthScreen";
import { useAuth } from "./AuthContext";

/**
 * Wraps the app shell.
 *   - `loading`        → spinner (validating saved token).
 *   - `anonymous`      → AuthScreen (login / signup).
 *   - `authenticated`  → children.
 */
import { useTranslation } from "react-i18next";
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <Loader2
          className="animate-spin text-slate-400"
          size={32}
          aria-label={t("authGate.loading")}
        />
      </div>
    );
  }
  if (status === "anonymous") return <AuthScreen />;
  return <>{children}</>;
}
