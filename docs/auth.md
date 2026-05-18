# Auth

Username + password, Argon2id-hashed, **opaque session tokens** stored in Postgres and transported via HttpOnly+Secure cookies. No JWT, no client-side secret, instant revocation.

## Why opaque tokens, not JWT

| Concern | JWT | Opaque tokens (this app) |
|---|---|---|
| Revocation | Wait for expiry, or maintain a revoked-jti list | `DELETE FROM sessions WHERE token_hash = ?` |
| Log-out-everywhere | Maintain a per-user invalidation timestamp | `DELETE FROM sessions WHERE user_id = ?` |
| Secret management | `JWT_SECRET` env var, rotation invalidates everyone | No server signing secret |
| Token theft via XSS | Real risk if stored in localStorage | Cookie is HttpOnly — JS can't read it |
| Per-request cost | Verify signature (~0.1 ms) | Postgres lookup (~1–2 ms) |
| Audit trail | None | `last_used_at`, `user_agent`, `ip_address` on every session |

The latency hit is the only tradeoff and it's negligible at our scale.

## Endpoints

### `POST /api/v1/auth/signup`

```json
// request
{
  "username":     "your-username",   // 3–64 chars, [a-z0-9_-], normalized lowercase
  "password":     "•••••••",         // 8–128 chars
  "role":         "caregiver",       // or "patient"
  "display_name": "Your Name",
  "invite_code":  "X7K2QA"           // optional — auto-pairs the new account with the inviter
}

// 201 response (user object only — the session cookie is set via Set-Cookie)
{ "id": "...", "username": "your-username", "role": "caregiver", "display_name": "Your Name" }
```

Response headers include:
```
Set-Cookie: cogni_session=<43-char-base64url>; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=604800
```

Behaviour:
- Username is lowercased before insertion. Duplicates → 409 `conflict`.
- Password is Argon2id-hashed before storage. Plaintext is never persisted, never logged.
- A new row in `sessions` is inserted; the raw token only ever lives in the cookie. The DB stores `sha256(token)` so a DB leak can't replay live sessions.
- Signup accepts an optional `invite_code` field — if present, the new account is immediately paired with the inviter (subject to the opposite-role rule, see [`pairing.md`](./pairing.md)).

### `POST /api/v1/auth/login`

```json
{ "username": "...", "password": "..." }
```

- Returns the user; sets the session cookie.
- Returns 401 `auth_error` for both "user not found" and "wrong password" — same response, same timing characteristics, so callers cannot enumerate usernames.
- On successful login, if `argon2-cffi` would now recommend stronger parameters than the stored hash, the hash is silently rehashed inside the same transaction.

### `POST /api/v1/auth/logout`

Deletes the current session row + clears the cookie. Always succeeds (200/204), even if the cookie was missing.

### `POST /api/v1/auth/logout-everywhere`

Deletes every session row for the authenticated user. Useful for "I think my account was compromised — log everyone out". Clears the current device's cookie.

### `GET /api/v1/auth/me`

Returns the authenticated user. Used by the frontend to know "am I signed in" on app boot.

## Sessions table

```sql
sessions (
  token_hash    BYTEA (32 bytes)  PRIMARY KEY,         -- sha256(raw_token)
  user_id       UUID              FK users.id ON DELETE CASCADE,
  created_at    TIMESTAMPTZ       default now(),
  last_used_at  TIMESTAMPTZ       default now(),       -- updated on every authed request
  expires_at    TIMESTAMPTZ       NOT NULL,
  user_agent    VARCHAR(512),                          -- for device-list UIs later
  ip_address    VARCHAR(64)
);
CREATE INDEX ix_sessions_user_id    ON sessions(user_id);
CREATE INDEX ix_sessions_expires_at ON sessions(expires_at);
```

- Token: 32 random bytes from `secrets.token_urlsafe(32)` → 43-char base64url string. Stored as `sha256(token)` only.
- Lifetime: 7 days (`SESSION_TTL_SECONDS = 604800`). Absolute expiry — we don't slide `expires_at`, we only slide `last_used_at`.
- Cleanup: `crud.session.purge_expired()` is a manual op for now (no scheduled job in MVP — expired rows are harmless until then because every lookup also checks `expires_at > now()`).

## Cookie configuration

```
Set-Cookie: cogni_session=<token>
  ; HttpOnly
  ; Secure
  ; SameSite=None
  ; Path=/
  ; Max-Age=604800
```

- **HttpOnly**: JS cannot read it. Defends against XSS.
- **Secure**: only sent over HTTPS. HF Space and Vercel are both HTTPS.
- **SameSite=None**: required for cross-site requests (Vercel frontend → HF backend). Modern browsers require `Secure` to be paired with `SameSite=None`.
- **Path=/**: applies to every endpoint.
- **Max-Age**: matches `SESSION_TTL_SECONDS`. Cookie is auto-deleted by the browser at expiry.

Frontend `fetch` sets `credentials: "include"` so the cookie travels.

## CSRF defence

`SameSite=None` removes the implicit CSRF protection cookies usually get. Two layers replace it:

1. **CORS allow-list.** `CORS_ALLOWED_ORIGINS` is enforced by `CORSMiddleware` and the browser blocks cross-origin requests with credentials from non-listed origins. Preflight is mandatory for our JSON-body requests, so this catches everything.
2. **`OriginCsrfMiddleware`** (`backend/app/lib/csrf.py`). On state-changing methods, the request's `Origin` header (if present) must be in the same allow-list. This is belt-and-suspenders for the rare browser that skips preflight (older mobile browsers, raw scripts).

No CSRF token is needed for this setup — by design, the same `CORS_ALLOWED_ORIGINS` env var is the single source of truth for who can hit us.

## Frontend integration

```
main.tsx
└── AuthProvider                  context: { user, login, signup, logout }
    └── AuthGate                  loading | anonymous | authenticated
        ├── AuthScreen            login + signup forms (anonymous)
        └── App (authenticated)
            └── AccountMenu       floating top-right: username, role, sign-out
```

Files:
- `src/api/client.ts` — fetch wrapper. Sets `credentials: "include"` on every call so the cookie rides along. No token storage at all.
- `src/auth/AuthContext.tsx` — provider + `useAuth()`. On mount, calls `/auth/me`; if it returns the user, we're authenticated. On a 401, we silently become anonymous.
- `src/auth/AuthScreen.tsx` — single-page form. Quick-fill buttons for the two demo accounts.
- `src/auth/AuthGate.tsx` — gates the entire `<App />`.
- `src/auth/AccountMenu.tsx` — floating account chip with sign-out.

There is no client-side token to leak: a successful XSS payload cannot exfiltrate session credentials, only act *as* the user during its execution window.

## Demo accounts

Seeded automatically on boot (`backend/app/seed.py`):

| Role | Username | Password |
|---|---|---|
| Caregiver | `demo-caregiver` | `demo-pass-1234` |
| Patient | `demo-patient` | `demo-pass-1234` |

Idempotent (skip if a user with that username already exists). The seed also pairs the two demo accounts on first boot so the live deploy always has a working caregiver↔patient pair for testing. Disable in production with `SEED_DEMO_USERS=false`.

## Threat model — what this protects against

| Threat | Defence |
|---|---|
| Plaintext password leak from DB | Argon2id with 64 MiB memory cost. |
| Username enumeration on login | Indistinguishable 401 for both failure modes. |
| Credential stuffing | Argon2 cost rate-limits attackers to ~10 attempts/sec/worker. (Add per-IP rate-limiting post-hackathon.) |
| Stolen session replay | Server-side revocation via `DELETE FROM sessions`. |
| Session token theft via XSS | HttpOnly cookie — JS can't read the token. |
| Cross-site request forgery | CORS allow-list + Origin header validation on writes. |
| Session token DB leak | Stored as `sha256(token)` — raw tokens unrecoverable from a DB dump. |
| MITM on the wire | TLS everywhere (HTTPS + Postgres `sslmode=require`). |

Out-of-scope at MVP: account lockout, email verification, password reset, 2FA, social login, OAuth. Documented as upgrade paths.

## Operational notes

- Rotating user passwords: change in app (future endpoint), or via `UPDATE users SET password_hash = ...`. Existing sessions are still valid until they expire — call `logout-everywhere` to invalidate.
- "Log everyone out" globally: `DELETE FROM sessions`. Users re-login from anonymous state on next request.
- Garbage collection: `crud.session.purge_expired()` — run periodically if the table grows. Each row is tiny (~150 bytes), so even a year of unpurged sessions is well under 100 MB.
