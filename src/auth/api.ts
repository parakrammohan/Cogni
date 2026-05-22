import { api } from "../api/client";
import type { AuthUser, LoginBody, SignupBody } from "./types";

/** All responses are just the user; the session cookie rides via Set-Cookie. */

export function login(body: LoginBody): Promise<AuthUser> {
  return api<AuthUser>("/api/v1/auth/login", { method: "POST", json: body });
}

export function signup(body: SignupBody): Promise<AuthUser> {
  return api<AuthUser>("/api/v1/auth/signup", { method: "POST", json: body });
}

export function me(): Promise<AuthUser> {
  return api<AuthUser>("/api/v1/auth/me", { method: "GET" });
}

export function logout(): Promise<void> {
  return api<void>("/api/v1/auth/logout", { method: "POST" });
}

export function logoutEverywhere(): Promise<void> {
  return api<void>("/api/v1/auth/logout-everywhere", { method: "POST" });
}

export function updateMe(body: {
  username?: string;
  display_name?: string;
  photo_url?: string;
}): Promise<AuthUser> {
  return api<AuthUser>("/api/v1/auth/me", { method: "PATCH", json: body });
}

export function changePassword(body: {
  current_password: string;
  new_password: string;
}): Promise<AuthUser> {
  return api<AuthUser>("/api/v1/auth/change-password", { method: "POST", json: body });
}

export function deleteAccount(body: {
  current_password: string;
  username_confirmation: string;
}): Promise<void> {
  return api<void>("/api/v1/auth/me", { method: "DELETE", json: body });
}
