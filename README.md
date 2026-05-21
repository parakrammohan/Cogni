# Cogni

A multi-user web app for monitoring people with mild cognitive
impairment / early-stage Alzheimer's. Two coordinated surfaces:

- **Patient view** — calm, large-touch UI with cognitive games, an
  eye-check + smooth-pursuit test, contacts, photo memories, a
  geofenced map, and an editable health profile.
- **Caregiver view** — operations dashboard with anomaly feed, gait
  analytics + fall detection, patient location + geofences, ocular
  biomarkers, cognition-trend slopes, ML risk screening, and a manage
  surface for the patient's care record.

Live deploy: [cogni-steel.vercel.app](https://cogni-steel.vercel.app)

---

## Try it

Two seeded accounts are reachable on every backend boot. Click the
chips on the login screen to auto-fill credentials.

| Role | Username | Password |
|---|---|---|
| Caregiver | `demo-caregiver` | `demo-pass-1234` |
| Patient | `demo-patient` | `demo-pass-1234` |

The two accounts are auto-paired on boot, so the caregiver dashboard
shows the patient's live state immediately. Sign in as both on
different browsers / devices to see the WebSocket live channel in
action.

---

## Architecture

```
┌────────────────────────────┐  HTTPS  ┌─────────────────────────────┐  TLS    ┌────────────────────────┐
│  Frontend (Vercel)         │ ──────▶ │  Backend (HF Space)         │ ─────▶  │  Postgres (Aiven)      │
│  cogni-steel.vercel.app    │   +WS   │  cogni-team-cogni.hf.space  │ asyncpg │  SSL-only, managed     │
│  React 19 + Vite SPA       │         │  FastAPI + SQLAlchemy async │         │  Fernet-encrypted PII  │
└────────────────────────────┘         └─────────────────────────────┘         └────────────────────────┘
              │                                       ▲
              └───── REST proxied via /api/* ─────────┘
                     (so the session cookie is first-party)
```

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, TypeScript 5 (strict), Tailwind 4, MediaPipe Tasks Vision, Leaflet, TanStack Query |
| Backend | Python 3.12, FastAPI 0.115, SQLAlchemy 2.0 async, asyncpg, Alembic, Argon2id, `cryptography` (Fernet) |
| ML | LightGBM, XGBoost, CatBoost via joblib (3 tabular models); ONNX Runtime CPU (MRI image classifier) |
| Database | Postgres 15 on Aiven, TLS-only |
| Auth | Username + password, opaque server-side session tokens (sha256-stored) in HttpOnly cookies. No JWT. |
| Deploy | Vercel (frontend, auto on push to `main`); HF Space Docker SDK (backend, auto via GitHub Actions on `backend/**` push) |

---

## What it does

### Multi-user accounts + caregiver / patient pairing
- Username + password sign-up with **Argon2id** password hashing, server-side opaque session tokens (sha256-stored), HttpOnly+Secure+SameSite=None cookies. No JWT, no client-side secret.
- **Two-way invite-code pairing**: either side generates a 6-char code; the other side redeems it. 15-min TTL, single active code per inviter, rate-limited (8/min/user, 15/min/IP). One caregiver ↔ one patient.
- Sessions are visible in the DB (`sessions` table) with `last_used_at`, `user_agent`, `ip_address`. Log-out-everywhere is `DELETE FROM sessions WHERE user_id = ?`.
- **Change password** rotates every existing session except the one issued back to the caller — leaked devices are kicked out automatically.
- **Username + display-name updates** with uniqueness check on `username`.
- **Delete account** (`DELETE /api/v1/auth/me`) with current-password verify + typed-username confirmation. Cascades via `ON DELETE CASCADE` to every owned row.

### Live WebSocket channel (with multi-device handoff)
- Patient device pushes a 1 Hz `patient_state` snapshot (vision metrics, gait label + signals, GPS, outOfBounds, wandering flag).
- Caregiver dashboard subscribes to the paired patient's topic and updates Overview / Map / Vision / Gait widgets in real time.
- **Single-writer enforcement per patient.** If a second patient device connects, the older one is displaced with a `{"type":"displaced"}` message and WS close code 4001. The displaced device shows a sticky amber banner with a **"Use this device"** button that reclaims primacy. Caregivers can have unlimited concurrent devices — multiple subscribers are fine; only the patient writer slot is exclusive.

### Patient self-care + caregiver oversight
- Editable patient **profile** (name, preferred name, DOB, blood type, allergies, address, medical notes, photo). Both patient and caregiver can edit; conflicts resolved last-write-wins. Server-side persistence; TanStack Query caches reads with a localStorage persister so reloads paint instantly.
- **Caregiver-controlled lock**: caregiver Manage page has a toggle that flips `profiles.caregiver_locked`. When set, the patient's Edit Details button is replaced with a Locked badge + an amber banner explaining where to ask for unlock. Backend enforces the lock — the patient role gets 403 on PUT when locked. Caregivers can always edit.
- **PII column encryption at rest.** 5 profile fields (`full_name`, `preferred_name`, `allergies`, `medical_notes`, `home_address`) and 2 contact fields (`name`, `phone`) are stored as Fernet-encrypted BYTEA via a SQLAlchemy `TypeDecorator`. Transparent to the API surface. Threat model: defends against accidental DB dumps; not E2EE.

### Detection pipelines (on the patient device)
- **Location**: `navigator.geolocation.watchPosition` + haversine + safe-zone radius. Wandering detector flags meander loops; pacing detector flags corridor-axis projection; dwelling detector flags rolling bounding box stillness.
- **Motion**: `DeviceMotionEvent` for accelerometer + gyroscope. Six-axis variance + peak-magnitude + post-impact stillness drives the gait classifier (Normal / Irregular / High fall risk / Fall detected, with explicit No-data and Calibrating states).
- **Vision**: `getUserMedia` + MediaPipe Tasks Vision Face Landmarker (478 landmarks + iris). Six-point EAR with hysteresis blink detection, head-pose-invariant gaze features, 9-point calibration (linear regression solved by in-place Gauss-Jordan), Kalman gaze smoothing, smooth-pursuit-test analysis (gain on slow-phase, trimmed-mean accuracy, adaptive saccade rate, latency from canvas-centroid phase shift).
- **Synthetic fallback** for each pipeline when permissions denied / hardware missing.

### Cognitive games + decline tracking
- Six games: sequence recall (Corsi-style spatial span), pattern ladder, visual search, Simon, reaction light, bubble pop. The hub component swaps between them.
- **Adaptive difficulty** — sequence recall persists the last successful span to `localStorage` and resumes there on the next session instead of always restarting at 3.
- Game results POST to backend `game_sessions`. Caregiver Trends scene plots history and runs a **least-squares slope** over the last 8 finalized sessions to flag declining memory span / rising reaction time (early-warning view; not clinical scoring).

### Risk screening (4 ML models)
| Tab | Algorithm | Honest CV metric |
|---|---|---|
| Clinical questionnaire | LightGBM, 32 features | accuracy 95.5 %, F1 0.94, AUC 0.95 |
| Brain volumes (OASIS) | CatBoost, 17 engineered features | accuracy 72 %, F1 0.71, AUC 0.78 (GroupKFold-by-subject) |
| Daily agitation forecast | CatBoost, 160 features (lag + rolling + baseline-delta) | accuracy 94 %, F1 0.04 at thr 0.5, AUC 0.80 (GroupKFold-by-patient, 4 % prevalence) |
| MRI image | timm CNN (in progress — bake-off across 8 backbones) | re-trained on the **unaugmented** 6 400-image source after we discovered the augmented set was a 7–156× expansion |

- All four run on the backend (3 via `joblib.load`, MRI via `onnxruntime`).
- Each tab has a **"How well does it work?" popover** with accuracy / precision / recall / F1 / AUC in plain English, plus a **TopFeatures** block showing the model's top-5 most important inputs (`feature_importances_`).
- Each tab also surfaces **past runs** for the patient as a collapsible audit list — backend already stamped every `screening_results` row, the UI just renders them.
- **MRI dataset audit** ([`docs/alzheimer_mri_audit.md`](./docs/alzheimer_mri_audit.md)) — full write-up of why the originally-given dataset inflates metrics 7-156× and how we corrected for it.

### Geofencing on Leaflet
- Caregiver draws **polygon** zones (tap-to-add-vertex) or **circle** zones (tap-to-place-centre + radius slider; circle is approximated as a 32-vertex polygon at commit). Per-zone `exit` / `dwelling` alert modes.
- Patient breadcrumb trail rendered live on both patient + caregiver Maps.
- Recenter (crosshair) button on both sides snaps to current patient position.

### Notifications + alerts
- Alerts surface in an in-app feed (Caregiver → Alerts) and as a bell badge on the topbar.
- **Grouped by module** (Gait, Location, Vision, Cognition) with a count per group and a "Critical only" filter (danger + warning).
- Dedupe: same module + same dedupe_key won't re-fire on every render.

### Admin dashboard
Operator-only, password-gated (`ADMIN_PASSWORD`) at the HF Space root URL. Shows DB row counts, recent users, recent screening runs, active WS subscribers, and a live PII-masked request log feed.

---

## Local development

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run check    # Type-check (tsc --noEmit, strict)
npm run lint     # ESLint
npm run build    # Production build (type-check + bundle + PWA artifacts)
npm run preview  # Preview production build
```

Camera + DeviceMotion APIs require a secure context — run on `localhost` or HTTPS.

The backend is not run locally by default; it lives at the HF Space.
To run a local backend, set `VITE_API_BASE_URL=http://localhost:7860`
in `.env.local` and start FastAPI from `backend/` with:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --port 7860 --reload
```

You'll also need `DATABASE_URL`, `ADMIN_PASSWORD`, and `FERNET_KEY` env vars (see Deploying below).

---

## Deploying

| Surface | Where | Trigger |
|---|---|---|
| Frontend | Vercel | Push to `main` |
| Backend | HF Space `cogni-team/cogni` | GitHub Actions on `backend/**` push (auto-cancels in-flight runs to avoid queue thrash) |
| DB migrations | Alembic, in the container CMD | Runs `alembic upgrade head` before uvicorn starts |

Required environment on the HF Space (Settings → Variables and Secrets):

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Aiven Postgres URL (with `sslmode=require`). Auto-normalised to the asyncpg dialect. |
| `FERNET_KEY` | **yes** | Base64 Fernet key for PII column encryption. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. **Permanent once set** — rotating it would orphan all encrypted rows. |
| `ADMIN_PASSWORD` | yes | Admin dashboard password. |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated. Defaults to `https://cogni-steel.vercel.app, http://localhost:5173`. |
| `SEED_DEMO_USERS` | no | `false` to skip the demo seed. |
| `DEMO_PASSWORD` | no | Override the `demo-pass-1234` default for the seeded accounts. |

The Vercel project rewrites `/api/*` to the HF Space so the session cookie stays first-party in the browser (fixes Safari ITP + Chrome incognito). WebSockets bypass the proxy and go straight at the HF hostname.

---

## Caveats / known limitations

- **Risk labels are heuristics**, not clinical scoring. The MRI model in particular is on the in-progress bake-off (commit history has the running numbers).
- **MRI dataset inflation**: the source dataset has known augmentation leakage. We re-trained on the unaugmented source and documented the audit in [`docs/alzheimer_mri_audit.md`](./docs/alzheimer_mri_audit.md).
- **Out-of-band caregiver delivery** (SMS / push / email): not implemented. Alerts surface in the in-app feed only.
- **OpenStreetMap tiles** are acceptable for low-volume demos; production usage with Singapore-context judging would benefit from swapping to OneMap.
- **PWA dynamic chunks** can fail after a Vercel redeploy. `src/lib/chunk-recovery.ts` catches that case (lazy-import error + `ErrorBoundary` hook), nukes the service worker + caches, and reloads.
- **WebSocket fan-out is in-process** — scaling beyond one HF Space replica would need Redis Pub/Sub.
- **PDPA / consent at signup**: not implemented. Tracked as a follow-up.

---

## Documentation

Deep-dive technical reference lives in [`docs/`](./docs/README.md). Highlights:

| Topic | Doc |
|---|---|
| Folder layout + frontend pipeline overview | [`docs/architecture.md`](./docs/architecture.md) |
| FastAPI app structure | [`docs/backend.md`](./docs/backend.md) |
| Database schema + Alembic history | [`docs/database.md`](./docs/database.md) |
| Auth model (sign-up, login, change password, delete account) | [`docs/auth.md`](./docs/auth.md) |
| Pairing flow (invite codes, rate limits) | [`docs/pairing.md`](./docs/pairing.md) |
| Live WebSocket channel + multi-device handoff | [`docs/websocket.md`](./docs/websocket.md) |
| Screening models (4 of them) | [`docs/screening.md`](./docs/screening.md) |
| MRI dataset audit | [`docs/alzheimer_mri_audit.md`](./docs/alzheimer_mri_audit.md) |
| Threat model + PII encryption | [`docs/security.md`](./docs/security.md) |
| Admin dashboard | [`docs/admin.md`](./docs/admin.md) |
| Vision pipeline | [`docs/vision.md`](./docs/vision.md) |
| Motion + gait | [`docs/motion.md`](./docs/motion.md) |
| Location + geofencing | [`docs/location.md`](./docs/location.md) |
| Cognitive games + decline detection | [`docs/cognition.md`](./docs/cognition.md) |
| Frontend architecture (state, lazy chunks, routing) | [`docs/frontend.md`](./docs/frontend.md) |
| Care features (profile, contacts, reminders, memories) | [`docs/care.md`](./docs/care.md) |
| Recent additions (changelog) | [`docs/recent-additions.md`](./docs/recent-additions.md) |
| Demo script for live judging | [`docs/demo-script.md`](./docs/demo-script.md) |
| Manual verification script | [`docs/verification.md`](./docs/verification.md) |
