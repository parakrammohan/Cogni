# CogniTrack

Multi-user Alzheimer's monitoring + screening web app. Two coordinated surfaces:

- **Patient view** — calm, large-touch UI with cognitive games, ocular check, contacts, photo memories.
- **Caregiver view** — operations dashboard with anomaly feed, gait analytics, geofencing map, ocular biomarkers, cognition trends, and an ML risk-screening page.

## Architecture

```
┌────────────────────────────┐  HTTPS  ┌─────────────────────────────┐  TLS   ┌────────────────────────┐
│  Frontend (Vercel)         │ ──────▶ │  Backend (HF Space)         │ ─────▶ │  Postgres (Aiven)      │
│  cogni-steel.vercel.app    │  JSON   │  cogni-team-cogni.hf.space  │ asyncpg│  SSL-only              │
│  React 19 + Vite SPA       │   +WS   │  FastAPI + SQLAlchemy async │        │  managed, encrypted    │
└────────────────────────────┘         └─────────────────────────────┘        └────────────────────────┘
```

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, TS strict, Tailwind 4, MediaPipe, Leaflet |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 async, asyncpg, Alembic, Argon2id, PyJWT |
| Database | Postgres 15 on Aiven |
| Deploy | Vercel (frontend, auto), Hugging Face Spaces Docker SDK (backend, auto via GitHub Actions) |
| Auth | Username + password, Argon2id hashing, JWT bearer (7-day TTL), gated app shell |

The backend lives in `backend/` and is mirrored to the HF Space on every push touching `backend/**` (see `.github/workflows/deploy-backend.yml`).

## Demo accounts

Two seeded accounts are created automatically on every backend boot, so the live deploy is always reachable for demo / Playwright / quick clicks:

| Role | Username | Password |
|---|---|---|
| Caregiver | `demo-caregiver` | `demo-pass-1234` |
| Patient | `demo-patient` | `demo-pass-1234` |

Disable seeding by setting `SEED_DEMO_USERS=false` on the HF Space. The seed also pairs the two demo accounts on first boot so the caregiver dashboard shows the patient's live state without any manual code redemption.

## What it does

- **Multi-user accounts** — username + password (Argon2id), opaque server-side session tokens in HttpOnly cookies. Caregivers and patients have distinct roles; the UI derives the active view from the auth role.
- **Two-way caregiver↔patient pairing** — either side generates a 6-char invite code (15-min TTL, single-active-per-inviter, rate-limited); the other side keys it in. The pairing makes one caregiver responsible for one patient's data and vice versa.
- **Live WebSocket channel** — the patient device pushes a 1 Hz state snapshot; the paired caregiver dashboard shows online status + latest values in real time.
- **Live sensors with synthetic fallback** when permissions or hardware are unavailable:
  - `navigator.geolocation.watchPosition`
  - `DeviceMotionEvent`
  - `navigator.mediaDevices.getUserMedia` + `@mediapipe/tasks-vision` Face Landmarker (478 landmarks + iris)
- **Anomaly detection**:
  - Geofencing & wandering (haversine + safe-zone radius, per-patient zones in Postgres)
  - Pacing detection via corridor-axis projection
  - Dwelling detection via rolling bounding box
  - Gait variance + fall-signature classifier
  - Six-point Eye Aspect Ratio with hysteresis-based blink detection
  - Cognitive decline detection vs. rolling 10-session baseline
- **Cognitive baseline** across six games: sequence recall, pattern reasoning, visual search, Simon, reaction-light, bubble-pop.
- **Smooth-pursuit eye-movement test** with a research-grade pipeline (see *Gaze pipeline* below).
- **Server-side ML risk screening** — four trained models (clinical tabular, OASIS, ADReSS-O agitation, MRI) run via `onnxruntime` on the backend. Every inference run persists to `screening_results` for caregiver history.
- **Operator admin dashboard** at the HF Space root — password-gated, shows DB row counts, recent activity, and a live (PII-masked) request log.

## Gaze pipeline

The Eye check + smooth-pursuit test is the most engineered scene in the app. The pipeline:

1. **Face mesh** — MediaPipe Tasks Vision face landmarker, 478 landmarks + iris, runs in a worker, throttled to ~7 Hz to avoid React render storms.
2. **Head-pose-invariant gaze features** — instead of using raw iris coords (which move with the head), we compute:
   - `eyeRelative.x / eyeRelative.y` — iris position normalized to the eye-corner bounding box. Cancels head translation entirely.
   - `irisDiameter` — average iris radius in pixels. Acts as a depth proxy so the regression compensates when the user leans in or out.
3. **9-point calibration** — explicit calibration stage with dwell-progress rings. Settle frames are auto-discarded; the resulting (features → screen) pairs feed a 4-coefficient linear regression solved via in-place Gauss–Jordan. RMS residual is reported alongside the model.
4. **Click-stream implicit calibration** — every click in the app is treated as a fixation. The (gaze, click-position) pairs are buffered to localStorage so a "Refine with N taps" action recomputes the regression without making the patient redo the 9-point dance.
5. **Kalman gaze smoothing** — 2D constant-velocity Kalman filter (state = `[x, y, vx, vy]`). Proper `F P Fᵀ` propagation across both 2×2 (position, velocity) blocks, then `(I − K H) P` measurement update. Predicts through blinks instead of dropping the eye, so the tracked target doesn't snap.
6. **Pursuit analysis**, in `features/vision/pursuit-analysis.ts`:
   - **Gain** is computed over slow-phase samples only (eye velocity below `3 × target velocity`, with a noise floor). Saccade spikes don't bias gain upward.
   - **Accuracy** is `100 − trimmed_mean(distance)` — top 10% dropped, robust against single saccades or blink-extrapolated outliers.
   - **Saccade rate** uses an adaptive threshold and burst-counts consecutive over-threshold frames as one saccade.
   - **Latency** is the median signed phase-shift around the canvas centroid, converted to ms via the target's mean angular velocity. Positive = eye lags target; negative = anticipatory tracking.

## Risk screening

The Caregiver → Screening page hosts four bundled ONNX models, each in its own tab with input UI tuned to the model's feature set:

| Model | Type | Reported metric | Input |
|---|---|---|---|
| `alzheimer_tabular` | sklearn GBM, 32 features | CV accuracy 94.9 %, AUC 0.952 | 32-field clinical questionnaire |
| `dementia_oasis` | sklearn GBM, 10 features | CV accuracy 81 %, AUC 0.891 | OASIS feature set + MRI volume defaults |
| `adresso_agitation` | sklearn GBM (class-balanced), 41 features | GroupKFold AUC 0.778 (no patient leakage) | Day-profile presets + per-feature tweaks |
| `alzheimer_mri` | sklearn StandardScaler→PCA(128)→MLP | Test acc 78 % | Image upload, browser-side resize to 64×64 grayscale |

Inference runs server-side: the patient device sends features (or an MRI image upload) to FastAPI, which loads the ONNX session once and caches it. Every run persists to `screening_results` so the caregiver dashboard can show history without re-inferring.

## Stack

| Concern | Choice |
|---|---|
| Frontend | React 19, Vite 7, TypeScript 5 (strict), Tailwind CSS 4 |
| Frontend data | TanStack Query (`@tanstack/react-query`) + localStorage persister |
| Vision | `@mediapipe/tasks-vision` (Face Landmarker, 478 landmarks + iris) |
| Maps | Leaflet 1.9 + React-Leaflet 5 (OpenStreetMap tiles) |
| UI primitives | Radix UI (Dialog, Slider, Switch, Tooltip, Tabs) |
| Animation | `framer-motion` |
| Notifications | `sonner` toasts |
| PWA | `vite-plugin-pwa` with stale-chunk recovery |
| Backend | FastAPI 0.115, uvicorn[standard], SQLAlchemy 2.0 async, asyncpg, Alembic |
| Auth | Argon2id (`argon2-cffi`) + opaque server-side session tokens (sha256-stored) |
| Backend ML | `onnxruntime` (Python), numpy, Pillow |
| Database | Postgres on Aiven (TLS-only) |
| Backend deploy | Hugging Face Spaces Docker SDK, port 7860, GitHub Actions auto-push |
| Frontend deploy | Vercel |

## Architecture

```
src/
  api/                api client + TanStack Query hooks per resource + queryClient
  auth/               AuthProvider, AuthGate, AuthScreen
  ws/                 LiveStreamProvider + useLiveStream/useLiveStreamSender hooks
  features/
    care/             profile/contacts/reminders/memories types + defaults
    location/         geo math, scenario builder, location analysis
    motion/           gait classifier, motion simulation
    vision/           useVision hook + EAR + blink + mesh overlay + gaze calibration
                      + Kalman smoother + pursuit-analysis + calibration stage
    screening/        thin client over the backend screening endpoints + model meta + schemas
  components/
    ui/               Radix wrappers + OnboardingGuide + ParametersModal
    panels/           Map / Gait / Trend / Alerts / Memory / Reasoning / Visual Search
    screening/        BinaryFormCard, MriUploadCard, FormRenderer, BinaryResultCard
    layout/           AppShell, Sidebar, TopBar (account dropdown), BottomNav
    PairingCard.tsx   shared two-way pairing UI
    games/            SimonGame, ReactionLightGame, BubblePopGame
    ErrorBoundary.tsx
  hooks/              useAlerts, useLocationTracking, useMotionTracking,
                      useAlertOrchestration, useBackendProfile, useSubjectPatient
  lib/                utils, charts, tone, chunk-recovery
  views/
    patient/          Home, Eye, Cognitive, People, Memories, Profile, Map
    caregiver/        Overview, Alerts, Gait, Map, Vision, Trends, Screening, Manage, CaregiverProfile
  App.tsx             composition root
  main.tsx            entry — mounts QueryClient + Auth + LiveStream providers
public/
  models/             *.meta.json files describing the screening form schemas

backend/
  Dockerfile          Python 3.12-slim, non-root uid 1000
  requirements.txt
  alembic/            schema migrations (append-only history)
  app/
    main.py           FastAPI app, middleware (CORS / OriginCsrf / RequestLog), lifespan
    config.py         pydantic-settings + DB URL normalisation
    db.py             async engine, SessionLocal, declarative Base
    security.py       Argon2id + opaque session-token generator
    deps.py           get_db, get_current_user, require_patient_access
    ws_hub.py         in-process WebSocket topic pub/sub
    seed.py           idempotent demo-account + pairing seed
    admin/            server-rendered admin dashboard
    lib/              errors, csrf, codes, rate_limit, request_log
    models/           SQLAlchemy ORM
    schemas/          pydantic request/response
    crud/             repository pattern
    ml/               ONNX loader + tabular/MRI inference + bundled artifacts/
    api/router.py     /api/v1 aggregator
    api/v1/           auth, pairing, profile, contacts, reminders, memories,
                      telemetry, alerts, geofence, screening, stream, health
```

The vision pipeline is a single hook (`useVision`) split into pure helpers (`ear.ts`, `overlay.ts`, `simulation.ts`, `landmarks.ts`, `calibration.ts`, `pursuit-analysis.ts`) so the inference loop, blink hysteresis, gaze regression, smoothing, and overlay rendering are independently testable.

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

## Bundle layout

The build splits into chunks so first paint doesn't wait on heavy code that's not on the default scene:

| Chunk | When loaded |
|---|---|
| `index` | Initial paint |
| `vision-runtime` | When the Eye Check scene mounts |
| `map-runtime` | When the Map tab opens (lazy) |

Screening inference no longer ships in the browser — it runs server-side via `onnxruntime` on the FastAPI backend. The OnboardingGuide is lazy and only fetched the first time the help button is clicked.

## Live vs simulated

Real browser features when permitted:
- GPS via `watchPosition`
- Motion via `devicemotion`
- Camera via `getUserMedia`
- Face landmarks via MediaPipe (lazy-loaded)
- Server-backed care data (profile, contacts, reminders, memories, telemetry, alerts, geofence) — cached locally by TanStack Query so reloads paint instantly.

Synthetic fallbacks when permissions are denied or hardware is missing (toggle in Parameters):
- Pre-baked breadcrumb routes (home loop, corridor pacing, prolonged dwelling)
- Synthetic accelerometer streams (normal, shuffling, fall)
- Animated moving target overlay used to demo the gaze pipeline

The Smooth Pursuit Test refuses to score against simulated gaze — it only runs when a live face mesh is locked.

## In-app user guide

A multi-page user guide ships in the app: chapters across Getting started, Patient view, Caregiver view, and System sections. The guide is **role-aware** — patients see patient + system chapters; caregivers see caregiver + system chapters. Open it from the sidebar footer or after first launch.

## Limitations

- No out-of-band caregiver delivery yet (no SMS / push / email). Caregiver alerts surface in the app's alerts feed.
- Risk labels are demo heuristics, not clinical scoring. The bundled ML models are educational tools, not approved medical devices.
- The OpenStreetMap tile server is acceptable for low-volume demos; production usage needs a paid tile provider.
- The MRI image classifier is trained on a Kaggle dataset with augmentation leakage between train/test, so its reported accuracy overstates real-world performance on truly unseen patients.
- PII column encryption (Fernet on `BYTEA` columns) is designed but not yet implemented — see `docs/security.md`.
- The WebSocket fan-out is in-process; scaling beyond one HF Space replica would need Redis Pub/Sub.

## Deploying

- **Frontend**: Vercel auto-deploys on push to `main`. Reads `VITE_API_BASE_URL` from the Vercel project env (defaults to the production HF Space URL).
- **Backend**: GitHub Actions auto-pushes `backend/**` to the HF Space on every commit. The Space rebuilds the Docker image and runs `alembic upgrade head` before uvicorn starts.

Required environment variables on the HF Space (Settings → Variables and Secrets):

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Aiven Postgres connection URL (with `sslmode=require`). |
| `ADMIN_PASSWORD` | recommended | Password for the operator admin dashboard. |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated; defaults include `cogni-steel.vercel.app` + `localhost:5173`. |
| `SEED_DEMO_USERS` | no | `false` to skip the demo seed in production. |

See [`docs/`](./docs/README.md) for the full technical reference.
