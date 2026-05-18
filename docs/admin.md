# Admin dashboard

The Hugging Face Space root URL (`https://cogni-team-cogni.hf.space/`)
serves a server-rendered admin dashboard. Visiting it without a session
shows a password form; with one, you see a read-only view of backend
state. It's intentionally separate from the patient/caregiver app —
operators don't sign in as a user.

## Auth

- Set the `ADMIN_PASSWORD` env var on the HF Space (Settings →
  Variables and Secrets). Without it, the backend falls back to the
  literal default in source — fine for poking around, but anyone who
  reads the repo can log in.
- On successful login the server sets an `cogni_admin` cookie whose
  value is `sha256(ADMIN_PASSWORD)` (8h max-age, HttpOnly, Secure,
  SameSite=Lax, Path=/).
- Each admin page checks the cookie value matches the current hash.
  Rotating `ADMIN_PASSWORD` invalidates every existing admin session
  for free.

The admin cookie is **separate** from the user `cogni_session` cookie
— admin authority does not grant any user permissions and vice versa.

## What the dashboard shows

| Section | Source |
|---|---|
| **Process** pillrow | `app.config.get_settings()` + `app.db` connectivity probe + `app.ws_hub` topic/subscriber counts |
| **Schema · row counts** | `SELECT count(*) FROM <each table>` |
| **Recent screening runs** | `screening_results` ORDER BY created_at DESC LIMIT 5 |
| **Recent users** | `users` ORDER BY created_at DESC LIMIT 5 |
| **Live request log** | The `RequestRing` populated by `RequestLogMiddleware` — last 200 requests, auto-refreshing every 2s |

The request log feed is PII-free by design:
- UUID-shaped path segments are masked to `:id`
- Long hex tokens (16+ chars) are masked to `:hex`
- Request bodies, query strings, and headers are never captured
- Admin's own paths and `/docs` are excluded so the feed stays
  signal-rich

Rendering uses `createElement` + `textContent` (never `innerHTML`), so
even if someone hits `/<script>...</script>` as a malicious path, the
admin browser is XSS-safe.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/` | none | Login page if no cookie, else 303 → `/admin` |
| `POST` | `/admin/login` | none (validates password) | Sets cookie, 303 → `/admin` |
| `GET` | `/admin` | admin cookie | Server-rendered dashboard |
| `GET` | `/admin/logs.json` | admin cookie | JSON of the request ring |
| `POST` | `/admin/logout` | admin cookie | Clears cookie, 303 → `/` |

`/admin/*` paths are exempt from `OriginCsrfMiddleware` (same-origin
form submission within the HF Space — its hostname isn't in the
CORS allow-list by design).

## Stylesheet

Pure HTML/CSS, no SPA. Inter + JetBrains Mono via Google Fonts.
Gradient brand heading, glassy cards with backdrop-blur, status pills
with dots, dark/light auto-switch via `prefers-color-scheme`. The
admin's only JavaScript is a tiny poller in `/admin` that fetches
`/admin/logs.json` every 2 s and rebuilds the live-log table — strict
DOM creation (no innerHTML).

## When the dashboard says "DB error"

That means the connection attempt in `_gather_dashboard_state` raised.
Likely causes:

1. `DATABASE_URL` is missing or malformed
2. Aiven service is paused / IP-allowlist mismatch
3. Connection timed out

The exception repr is shown inline (truncated). Cross-reference with
the request log feed and HF container logs.

## Diagnosing login failures

If you enter the right password and the page seems to do nothing:

1. The backend logs the outcome at `INFO` level with no secrets:
   ```
   cogni.admin: login: matched=True submitted_len=12 expected_len=12
   cogni.admin: login: set-cookie name=cogni_admin value_prefix=abcd1234 location=/admin
   cogni.admin: dashboard: cookie_present=True value_prefix=abcd1234 expected_prefix=abcd1234
   ```
2. View these in the HF Space → Logs → Container tab.
3. If `matched=False`, the password you typed doesn't equal the
   `ADMIN_PASSWORD` env var (or its absent and the default is still
   the literal in source).
4. If `matched=True` but `cookie_present=False` on the subsequent GET
   `/admin`, the browser isn't carrying the cookie back. That points
   to a cookie attribute issue (Secure / SameSite / Path) or the
   browser's privacy settings.
5. If `value_prefix` mismatches, the password was rotated between the
   set-cookie and the read.
