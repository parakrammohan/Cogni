import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as authApi from "./api";
import { clearQueryCache } from "../api/queryClient";
import { STORAGE_KEYS } from "../constants/app";
import type { AuthUser, LoginBody, SignupBody } from "./types";

/**
 * Wipe every per-user piece of client state on sign-out / account delete.
 *
 * Without this, the next user signing in on the same device sees the
 * previous user's data hydrate from localStorage (TanStack persister AND
 * the legacy `usePersistentState` keys still in use for some scenes)
 * until each query refetches — a real cross-user PII bleed.
 */
function purgeClientState(): void {
  clearQueryCache();
  if (typeof window === "undefined") return;
  // Per-user data still managed via usePersistentState rather than the
  // backend. Trail / pursuit history / game history / safe-zone / etc.
  // We deliberately leave UI prefs (settings, onboardingGuide) alone —
  // those are device-local, not user-bound.
  const userScoped: (keyof typeof STORAGE_KEYS)[] = [
    "trail",
    "safeZone",
    "profile",
    "contacts",
    "reminders",
    "memories",
    "pursuitHistory",
    "gameHistory",
    "simulations",
    "gazeCalibration",
    "implicitCalibrationSamples",
    "geofence",
  ];
  for (const k of userScoped) {
    try {
      window.localStorage.removeItem(STORAGE_KEYS[k]);
    } catch {
      /* private mode etc. — harmless */
    }
  }
}

type Status = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (body: LoginBody) => Promise<AuthUser>;
  signup: (body: SignupBody) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateMe: (body: {
    username?: string;
    display_name?: string;
    photo_url?: string;
  }) => Promise<AuthUser>;
  changePassword: (body: { current_password: string; new_password: string }) => Promise<AuthUser>;
  deleteAccount: (body: {
    current_password: string;
    username_confirmation: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  // On mount, ask the server who we are. If a session cookie is set
  // and valid, we land authenticated; otherwise anonymous. No tokens
  // touched in JS — they live in the httpOnly cookie.
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (body: LoginBody): Promise<AuthUser> => {
    const u = await authApi.login(body);
    setUser(u);
    setStatus("authenticated");
    return u;
  }, []);

  const signup = useCallback(async (body: SignupBody): Promise<AuthUser> => {
    const u = await authApi.signup(body);
    setUser(u);
    setStatus("authenticated");
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* even if the server call fails, drop client state */
    }
    purgeClientState();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const updateMe = useCallback(
    async (body: { username?: string; display_name?: string; photo_url?: string }) => {
      const u = await authApi.updateMe(body);
      setUser(u);
      return u;
    },
    [],
  );

  const changePassword = useCallback(
    async (body: { current_password: string; new_password: string }) => {
      const u = await authApi.changePassword(body);
      setUser(u);
      return u;
    },
    [],
  );

  const deleteAccount = useCallback(
    async (body: { current_password: string; username_confirmation: string }) => {
      await authApi.deleteAccount(body);
      purgeClientState();
      setUser(null);
      setStatus("anonymous");
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout, updateMe, changePassword, deleteAccount }),
    [status, user, login, signup, logout, updateMe, changePassword, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
