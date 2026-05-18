/**
 * Thin fetch wrapper used by the API hooks layer.
 *
 * In production the SPA and the API share an origin: Vercel rewrites
 * `/api/*` to the HF Space FastAPI backend (see vercel.json). That
 * makes the session cookie first-party, which keeps it working in
 * Chrome incognito + Safari ITP + every third-party-cookie blocker.
 *
 * `VITE_API_BASE_URL` is only honoured in development (so a contributor
 * running `npm run dev` can point Vite directly at a remote backend).
 * In production builds the env var is intentionally ignored — keeping
 * everything same-origin via the Vercel proxy is the whole point.
 */
const apiBaseEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  "",
);
export const apiBase: string = import.meta.env.DEV && apiBaseEnv ? apiBaseEnv : "";

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
  /** JSON-serializable body. Omit for GET. Mutually exclusive with `body`. */
  json?: unknown;
  /** Raw body for non-JSON requests (e.g. multipart/form-data). When
   *  used, the caller is responsible for any Content-Type concerns —
   *  for FormData the browser sets the boundary automatically when we
   *  don't override it. */
  body?: BodyInit | null;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { json, body, ...init } = opts;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (json !== undefined) headers.set("Content-Type", "application/json");

  const finalBody = json !== undefined ? JSON.stringify(json) : body ?? undefined;
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers,
    body: finalBody,
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
