import { api } from "../api/client";
import type { AuthUser, LoginBody, SignupBody, TokenResponse } from "./types";

export function login(body: LoginBody): Promise<TokenResponse> {
  return api<TokenResponse>("/api/v1/auth/login", { method: "POST", json: body, auth: false });
}

export function signup(body: SignupBody): Promise<TokenResponse> {
  return api<TokenResponse>("/api/v1/auth/signup", { method: "POST", json: body, auth: false });
}

export function me(token?: string): Promise<AuthUser> {
  return api<AuthUser>("/api/v1/auth/me", { method: "GET", token });
}
