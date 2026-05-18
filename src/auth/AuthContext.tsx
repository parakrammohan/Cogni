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
import type { AuthUser, LoginBody, SignupBody } from "./types";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (body: LoginBody) => Promise<AuthUser>;
  signup: (body: SignupBody) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateMe: (body: { username?: string; display_name?: string }) => Promise<AuthUser>;
  changePassword: (body: { current_password: string; new_password: string }) => Promise<AuthUser>;
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
    setUser(null);
    setStatus("anonymous");
  }, []);

  const updateMe = useCallback(
    async (body: { username?: string; display_name?: string }) => {
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

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout, updateMe, changePassword }),
    [status, user, login, signup, logout, updateMe, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
