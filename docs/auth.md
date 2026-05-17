# Auth

Username + password, Argon2id-hashed, JWT bearer tokens, no email at MVP. The full app is gated by an `AuthGate` on the frontend; every backend route except `/health`, `/api/v1/version`, and `/api/v1/auth/{signup,login}` requires a valid token.

## Endpoints

### `POST /api/v1/auth/signup`

```json
// request
{
  "username":     "zijian",        // 3–64 chars, [a-z0-9_-], normalized lowercase
  "password":     "•••••••",       // 8–128 chars
  "role":         "caregiver",     // or "patient"
  "display_name": "Zijian",
  "invite_code":  "X7K2QA"         // patient only, optional (Stage 2)
}

// 201 response
{
  "user": { "id": "...", "username": "zijian", "role": "caregiver", "display_name": "Zijian" },
  "access_token": "eyJhbGciOi...",
  "token_type":   "bearer",
  "expires_in":   604800
}
```

Behaviour:
- Username is lowercased before insertion. Duplicates → 409 `conflict`.
- Password is Argon2id-hashed before storage. Plaintext is never persisted, never logged.
- Patient signup accepts `invite_code`. Stage 1 stores nothing for it; Stage 2 will validate + auto-pair.

### `POST /api/v1/auth/login`

```json
{ "username": "...", "password": "..." }
```

- Returns the same `TokenResponse` shape as signup.
- Returns 401 `auth_error` for both "user not found" and "wrong password" — same response, same timing characteristics, so callers cannot enumerate usernames.
- On successful login, if `argon2-cffi` would now recommend stronger parameters than the stored hash (e.g. after upgrading argon2-cffi), the hash is silently rehashed inside the same transaction. Users never have to re-do this themselves.

### `GET /api/v1/auth/me`

Returns the authenticated user. Used by the frontend to validate a saved token on app boot.

## Password hashing — Argon2id

Reasons we picked Argon2id over bcrypt:

- **Memory-hard**: requires ~64 MiB per hash by default, killing GPU/ASIC speedups that have eroded bcrypt's margins.
- **Tunable across three axes**: time cost, memory cost, parallelism — bcrypt only has rounds.
- **OWASP 2024 recommendation** for new applications.

We use `argon2.PasswordHasher()` with its default parameters: `time_cost=3`, `memory_cost=65536` (KiB = 64 MiB), `parallelism=4`, `hash_len=32`, `salt_len=16`. Verifying a hash uses constant-time comparison internally.

Code: `backend/app/security.py`.

## JWT bearer tokens

- Algorithm: `HS256` (symmetric, signed by `JWT_SECRET`).
- Payload: `{ sub: <user_uuid>, role, iat, exp }`. No PII.
- Lifetime: 7 days (`JWT_TTL_SECONDS = 604800`). Long-lived because there's no refresh-token endpoint at MVP — users just re-login when it expires.
- Transport: `Authorization: Bearer <token>` header on REST. WebSocket auth (Stage 4) takes the token as a `?token=` query param because HF Spaces don't allow custom headers on the WS handshake.
- Storage on the frontend: `localStorage["cognitrack.auth.token"]`. Documented upgrade target: httpOnly cookies. localStorage is XSS-readable, but on a hackathon scope where there's no rich text input crossing trust boundaries, the risk is acceptable.

## Frontend integration

```
main.tsx
└── AuthProvider                  context: { user, token, login, signup, logout }
    └── AuthGate                  loading | anonymous | authenticated
        ├── AuthScreen            login + signup forms (anonymous)
        └── App (authenticated)
            └── AccountMenu       floating top-right: username, role, sign-out
```

Files:
- `src/api/client.ts` — fetch wrapper. Reads `VITE_API_BASE_URL`, attaches `Bearer` automatically, throws `ApiError` on non-2xx.
- `src/auth/AuthContext.tsx` — provider + `useAuth()` hook. On mount, if a token is saved, `/auth/me` is called to validate it; a 401 silently signs out.
- `src/auth/AuthScreen.tsx` — single-page form, mode toggle between login and signup. Has quick-fill buttons for the two demo accounts.
- `src/auth/AuthGate.tsx` — gates the entire `<App />`.
- `src/auth/AccountMenu.tsx` — floating account chip with sign-out menu. Rendered alongside `<App />`.

## Demo accounts

The backend boots with two seeded accounts (`backend/app/seed.py`), so the live deploy is always reachable:

| Role | Username | Password |
|---|---|---|
| Caregiver | `demo-caregiver` | `demo-pass-1234` |
| Patient | `demo-patient` | `demo-pass-1234` |

The seed is idempotent (skips if a user with that username already exists). Disable in production by setting `SEED_DEMO_USERS=false`. From Stage 2 onward this seed will also auto-pair the two accounts.

## Threat model — what this protects against

| Threat | Defence |
|---|---|
| Plaintext password leak from DB | Argon2id with 64 MiB memory cost. |
| Username enumeration on login | Indistinguishable 401 for both failure modes. |
| Credential stuffing | Argon2 cost rate-limits attackers to ~10 attempts/sec on commodity hardware per worker. (Add per-IP rate-limiting post-hackathon.) |
| Stolen JWT replay | 7-day TTL caps replay window; user re-logs in. (Add token revocation list post-hackathon.) |
| MITM on the wire | TLS everywhere (HTTPS + Postgres `sslmode=require`). |
| Cross-origin requests from arbitrary sites | CORS whitelist set via `CORS_ALLOWED_ORIGINS`. |

Out-of-scope at MVP: account lockout, email verification, password reset, 2FA, social login, OAuth. Documented as upgrade paths.
