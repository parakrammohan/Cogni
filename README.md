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

Disable seeding by setting `SEED_DEMO_USERS=false` on the HF Space. Once Stage 2 ships, the two demo accounts will also be auto-paired so the caregiver dashboard shows the patient's live state without any manual code redemption.

## Limitations of the current rollout

The full-stack refactor lands in stages (see `CLAUDE.md`). At this snapshot:

- ✅ Stage 0 — backend skeleton + HF auto-deploy pipeline
- ✅ Stage 1 — DB + auth (signup / login / `/me`, JWT bearer)
- 🚧 Stage 2 — caregiver↔patient pairing (invite codes)
- 🚧 Stage 3 — resource migration (profile, contacts, reminders, memories, pursuit, games, alerts, geofence)
- 🚧 Stage 4 — live WebSocket channel for caregiver dashboard
- 🚧 Stage 5 — ML inference moved to the backend (drops ONNX runtime from the frontend bundle)

Until Stage 3 lands, in-app data (profile, contacts, etc.) still lives in `localStorage` and is per-device.

## What it does

- **Live sensors with synthetic fallback** when permissions or hardware are unavailable:
  - `navigator.geolocation.watchPosition`
  - `DeviceMotionEvent`
  - `navigator.mediaDevices.getUserMedia` + `@mediapipe/tasks-vision` Face Landmarker (478 landmarks + iris)
  - `localStorage` persistence
- **Anomaly detection**:
  - Geofencing & wandering (haversine + safe-zone radius)
  - Pacing detection via corridor-axis projection
  - Dwelling detection via rolling bounding box
  - Gait variance + fall-signature classifier
  - Six-point Eye Aspect Ratio with hysteresis-based blink detection
  - Cognitive decline detection vs. rolling 10-session baseline
- **Cognitive baseline** across six games: sequence recall, pattern reasoning, visual search, Simon, reaction-light, bubble-pop.
- **Smooth-pursuit eye-movement test** with research-grade pipeline (see *Gaze pipeline* below).
- **Risk screening** — four ML models bundled as ONNX, executed in WebAssembly via `onnxruntime-web`. No data leaves the browser.

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

Inference is `onnxruntime-web` running in WebAssembly. The 26 MiB wasm runtime is loaded externally from jsdelivr and PWA-cached, not bundled into the app.

## Stack

| Concern | Choice |
|---|---|
| UI runtime | React 19, Vite 7, TypeScript 5 (strict) |
| Vision | `@mediapipe/tasks-vision` (Face Landmarker, 478 landmarks + iris) |
| ML inference | `onnxruntime-web` (4 bundled ONNX models, WASM execution provider) |
| Maps | Leaflet 1.9 + React-Leaflet 5 (OpenStreetMap tiles) |
| Styling | Tailwind CSS 4 + `tailwindcss-animate` |
| UI primitives | Radix UI (Dialog, Slider, Switch) |
| Animation | `framer-motion` (shared-layout transitions, spring-driven sidebar) |
| Notifications | `sonner` toasts + persistent alert feed |
| PWA | `vite-plugin-pwa` with manifest, runtime caching, ONNX model precache |
| Lint / format | ESLint flat config, typescript-eslint, Prettier |

## Architecture

Feature-first folder layout:

```
src/
  features/
    care/             profile, contacts, reminders, memories types + defaults
    location/         geo math, scenario builder, location analysis
    motion/           gait classifier, motion simulation
    vision/           useVision hook, EAR + blink, mesh overlay, gaze calibration,
                      Kalman smoother, pursuit-analysis, calibration stage
    screening/        ONNX inference, model schemas (per-model field definitions)
  components/
    ui/               Radix wrappers + OnboardingGuide + ParametersModal
    panels/           domain panels (MapPanel, GaitPanel, AlertsPanel, ...)
    screening/        BinaryFormCard, MriUploadCard, FormRenderer, BinaryResultCard
    layout/           AppShell + Sidebar + BottomNav (overflow "More" sheet)
    games/            SimonGame, ReactionLightGame, BubblePopGame
    ErrorBoundary.tsx
  hooks/              useAlerts, useLocationTracking, useMotionTracking,
                      useAlertOrchestration, usePersistentState,
                      useClickStreamCalibration
  lib/                utils, charts (SVG path), tone (semantic color helpers)
  constants/          storage keys, sensor caps, default safe zone
  types/              cross-feature primitives + re-exports
  views/
    patient/          HomeScene, EyeScene, CognitiveScene, PeopleScene,
                      MemoriesScene, ProfileScene, MapScene
    caregiver/        OverviewScene, MapScene, AlertsScene, GaitScene,
                      VisionScene, TrendsScene, ScreeningScene, ManageScene
  App.tsx             composition root
public/
  models/             4 ONNX files + meta JSON, served as static assets
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

The build splits into four chunks so first paint doesn't wait on heavy code that's not on the default scene:

| Chunk | Size | When loaded |
|---|---|---|
| `index` | ~610 KiB / ~184 KiB gz | Initial paint |
| `vision-runtime` | ~136 KiB / ~41 KiB gz | When the eye-check scene mounts |
| `map-runtime` | ~167 KiB / ~49 KiB gz | When the map tab opens (lazy) |
| `onnx-runtime` | ~356 KiB / ~95 KiB gz | When the Screening tab opens (lazy) |

The OnboardingGuide is also lazy and rendered conditionally — it's only fetched the first time the help button is clicked.

## Live vs simulated

Real browser features when permitted:
- GPS via `watchPosition`
- Motion via `devicemotion`
- Camera via `getUserMedia`
- Face landmarks via MediaPipe (lazy-loaded)
- Game sessions, calibration, and history persisted in `localStorage`

Synthetic fallbacks when permissions are denied or hardware is missing (toggle in Parameters):
- Pre-baked breadcrumb routes (home loop, corridor pacing, prolonged dwelling)
- Synthetic accelerometer streams (normal, shuffling, fall)
- Animated moving target overlay used to demo the gaze pipeline

The Smooth Pursuit Test refuses to score against simulated gaze — it only runs when a live face mesh is locked.

## In-app user guide

A multi-page user guide ships in the app: 20 chapters across Getting started, Patient view, Caregiver view, and System sections. Each chapter has a hero header, structured steps, callouts, and metric reference tables. Open it from the sidebar footer or after first launch.

## Limitations

- Frontend-only. No real caregiver delivery (Twilio, push, email). All alerts are local.
- Risk labels are demo heuristics, not clinical scoring. The bundled ML models are educational tools, not approved medical devices.
- The OpenStreetMap tile server is acceptable for low-volume demos; production usage needs a paid tile provider.
- The MRI image classifier is trained on a Kaggle dataset with augmentation leakage between train/test, so its reported accuracy overstates real-world performance on truly unseen patients.

## Deploying

The repo is configured for Vercel (`vercel.json`). The PWA service worker is generated at build time and registered on first load. The four ONNX models, the MediaPipe face mesh, and recent OpenStreetMap tiles are all PWA-cached so the app works offline after first load.
