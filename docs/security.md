# Security

This document describes the security posture of the deployed Cogni stack: transport, storage, authentication, secrets, and what we explicitly do not protect against.

## TL;DR

We are running **server-trusted, transit-and-rest encrypted** — not end-to-end encrypted. The server can read plaintext PII and ML feature vectors because it computes on them. Defences are layered:

1. TLS everywhere on the wire.
2. Aiven encrypts the Postgres disk at rest.
3. PII columns are app-layer Fernet-encrypted on top of (2) (Stage 3+).
4. Passwords are Argon2id-hashed (memory-hard, GPU-resistant).
5. Network-level isolation between frontend, backend, DB via separate managed hosts.

## Layer-by-layer

### Transport

| Hop | Encryption |
|---|---|
| Browser → Vercel CDN | HTTPS (Vercel-managed cert). |
| Browser → HF Space | HTTPS (HF-managed cert on `*.hf.space`). |
| Browser → HF Space WebSocket | WSS (same cert chain). |
| HF Space → Aiven Postgres | TLS, `sslmode=require` in the connection string. `config.py` translates `sslmode=require` to asyncpg's equivalent `ssl=require`. |
| GitHub Actions → HF API | HTTPS (huggingface_hub library uses `requests` with default cert verification). |

There is no plaintext traffic anywhere in the production path.

### At rest

| Where | Protection |
|---|---|
| Aiven Postgres disk | Encrypted at rest by default (LUKS at the VM layer). |
| Aiven backups | Encrypted at rest. |
| HF Space container filesystem | Ephemeral; no data persists across restarts. |
| GitHub secrets (`HF_TOKEN`) | Encrypted at rest by GitHub. |
| HF Space secrets (`DATABASE_URL`, `JWT_SECRET`, `FERNET_KEY`) | Encrypted at rest by HF. Mounted as env vars at container start; never written to disk by our code. |

### Application layer — PII column encryption (Stage 3+)

Postgres "encrypted at rest" only protects against someone physically stealing the disk. It does **not** protect against:

- An accidental `pg_dump` being shared.
- A misconfigured backup.
- A compromised Aiven operator account.

For those scenarios we wrap individual PII columns in a second layer of encryption at the application level. The plan:

- Library: `cryptography.fernet.Fernet` (AES-128-CBC + HMAC-SHA-256 under the hood).
- Key: `FERNET_KEY` env var, base64-encoded 32 bytes. Rotated by re-encrypting + flipping the key — out of scope for hackathon.
- Columns targeted: `profile.medical_notes`, `profile.allergies`, `profile.home_address`, `contacts.phone`, `memory.caption`, `memory.image_url` (when it carries a data URL).
- Column type in Postgres: `BYTEA`.

This is **defence in depth**, not E2EE — the backend has the key and can read every byte. It mitigates the "what if someone gets the database file" scenario.

### Passwords

Argon2id via `argon2-cffi`, default parameters (64 MiB memory cost, 3 iterations). Login is intentionally ~100 ms slow per attempt; this is a feature, not a bug. See `auth.md`.

### Sessions

Opaque server-side session tokens stored in Postgres (`sessions` table). The raw token only ever exists in an HttpOnly+Secure cookie on the client and on the wire — the database stores `sha256(token)`, so a DB dump cannot replay live sessions.

- 7-day absolute expiry. `last_used_at` slides on every authed request.
- Revocation: `DELETE FROM sessions WHERE token_hash = ?`. Logout-everywhere: `DELETE FROM sessions WHERE user_id = ?`.
- No `JWT_SECRET`, no signing keys, no symmetric or asymmetric crypto. The token is its own identity.

See `auth.md` for the full picture, including the CSRF defence (CORS allow-list + Origin header validation on writes).

## Secrets management

| Secret | Stored in | Used by |
|---|---|---|
| `HF_TOKEN` | GitHub Actions secret. Fine-grained — write access to `cogni-team/cogni` only. | The deploy workflow. Never reaches runtime. |
| `DATABASE_URL` | HF Space secret. | Backend at boot (alembic + SQLAlchemy). |
| `FERNET_KEY` | HF Space secret (Stage 3+). | Backend encrypts/decrypts PII columns. |
| Demo password | Default `demo-pass-1234`, override via `DEMO_PASSWORD`. | Seed only. Not really a secret. |

There is intentionally no `JWT_SECRET` or analogous signing key — sessions are opaque tokens stored server-side, so there's no signature to verify.

We never:
- Log secrets.
- Echo them in CI output.
- Bake them into the Docker image.
- Commit `.env` files (`.env*` is gitignored).

## CORS

`CORSMiddleware` allows only the origins listed in `CORS_ALLOWED_ORIGINS` (default: `https://cogni-steel.vercel.app` + `http://localhost:5173`). Browser preflights for any other origin are rejected.

`allow_credentials=True` is set because we want cookies to work later (planned upgrade from `localStorage` to httpOnly cookies). With cookie auth, CORS becomes the principal CSRF defence.

## What we explicitly do not protect against

| Threat | Why we don't | Future path |
|---|---|---|
| Compromised server (RCE in backend) | True E2EE is incompatible with server-side ML inference, which is a core requirement. | Move inference client-side (regresses bundle size) — out of scope. |
| Account lockout on brute-force | No rate limiter in MVP. Argon2 cost is the only brake. | Add per-IP & per-username rate limit with a Redis token bucket. |
| Password reset flows | No email integration. | Plug in SES / Resend, add `password_resets` table. |
| 2FA | Hackathon scope. | TOTP via `pyotp`. |
| Stolen JWT replay during the 7-day window | No revocation list. | Maintain a `revoked_jwts` table keyed by `jti`. |
| Audit log tampering | Audit log is in the same DB as everything else. | Stream to an append-only sink (SIEM / object storage). |

## How to rotate keys

| Key | Rotation procedure |
|---|---|
| `HF_TOKEN` | Generate a new fine-grained token on HF → revoke the old → update `HF_TOKEN` GitHub secret. No downtime. |
| Session tokens | Per-token: `DELETE FROM sessions WHERE token_hash = ?`. Per-user: `DELETE FROM sessions WHERE user_id = ?`. Globally (force-logout everyone): `TRUNCATE sessions`. No restart needed in any case. |
| `FERNET_KEY` (Stage 3+) | Out of scope for hackathon. Production path: `MultiFernet` with the new key first, the old key second, then a background job re-encrypts and the old key is removed. |
| Database password | Rotate via Aiven console → update `DATABASE_URL` on HF Space → restart Space. |

## Operational guardrails

- The HF token in GitHub Actions is fine-grained — write to one Space, nothing else. Even if it were leaked, the blast radius is one Space.
- `JWT_SECRET` and `DATABASE_URL` live only on the HF Space, never on GitHub.
- `.gitignore` excludes `.env*` and `CLAUDE.md` (which can carry context). Never let credentials enter version control.

## Compliance posture

The app does not currently claim PHI/PCI/GDPR compliance. The architecture (encrypted in transit, encrypted at rest, app-layer PII encryption) is consistent with the technical controls those regimes require, but compliance also needs audit trails, DPAs, retention policies, breach notification SOPs — none of which are wired up in MVP.
