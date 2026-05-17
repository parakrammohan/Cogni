import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { readToken, writeToken } from "../api/client";
import * as authApi from "./api";
import type { AuthUser, LoginBody, SignupBody } from "./types";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  token: string | null;
  login: (body: LoginBody) => Promise<AuthUser>;
  signup: (body: SignupBody) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>(() => (readToken() ? "loading" : "anonymous"));

  // On mount, if we have a saved token, validate it against /me. If
  // the server says the token is bad, we silently sign out instead of
  // showing an error — the user just sees the login screen.
  useEffect(() => {
    if (!token) {
      setStatus("anonymous");
      setUser(null);
      return;
    }
    let cancelled = false;
    authApi
      .me(token)
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        writeToken(null);
        setToken(null);
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const apply = useCallback((res: { user: AuthUser; access_token: string }) => {
    writeToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    setStatus("authenticated");
    return res.user;
  }, []);

  const login = useCallback(
    async (body: LoginBody) => apply(await authApi.login(body)),
    [apply],
  );

  const signup = useCallback(
    async (body: SignupBody) => apply(await authApi.signup(body)),
    [apply],
  );

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, token, login, signup, logout }),
    [status, user, token, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
