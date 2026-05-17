/**
 * Thin fetch wrapper used by the API hooks layer.
 *
 * Auth is via httpOnly cookies set by the backend — the browser handles
 * them transparently. We just have to set `credentials: "include"` on
 * every request so the cookie rides along cross-origin (Vercel → HF).
 *
 * The base URL comes from `VITE_API_BASE_URL`. We fall back to the
 * production HF Space hostname so the SPA still works if the env var
 * is ever missing on a Preview build.
 */

const FALLBACK_BASE = "https://cogni-team-cogni.hf.space";
export const apiBase: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? FALLBACK_BASE;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly detail: string;

  constructor(status: number, detail: string, code?: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  /** JSON-serializable body. Omit for GET. */
  json?: unknown;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { json, ...init } = opts;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }

  if (!res.ok) {
    const obj = (payload as { detail?: unknown; code?: unknown } | null) ?? {};
    const detail = typeof obj.detail === "string" ? obj.detail : `Request failed (${res.status})`;
    const code = typeof obj.code === "string" ? obj.code : undefined;
    throw new ApiError(res.status, detail, code);
  }

  return payload as T;
}
