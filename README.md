# CogniTrack

Browser-based Alzheimer's detection and care prototype built with React 19, TypeScript, Vite, Tailwind CSS, MediaPipe Tasks Vision, and Leaflet. Two coordinated surfaces:

- **Patient view** — calm, guided UI with cognitive games and ocular screening.
- **Caregiver view** — operations dashboard with anomaly feed, gait analytics, spatial map, and trend charts.

The app is fully client-side. No backend, no audit trail, no clinical scoring — this is a hackathon-grade demo.

## What it does

- Streams real browser sensors and falls back to synthetic data when permissions or hardware are unavailable:
  - `navigator.geolocation.watchPosition`
  - `DeviceMotionEvent`
  - `navigator.mediaDevices.getUserMedia` + `@mediapipe/tasks-vision` Face Landmarker
  - `window.speechSynthesis`
  - `localStorage` persistence
- Implements explicit anomaly logic for:
  - Geofencing & wandering detection (haversine + safe-zone radius)
  - Pacing detection via corridor-axis projection
  - Dwelling detection via rolling bounding box
  - Gait variance analysis with explicit fall-signature classifier
  - Six-point Eye Aspect Ratio (EAR) with hysteresis-based blink detection
- Cognitive baseline tracking across three games: sequence recall, pattern reasoning, visual search.
- Smooth-pursuit eye-movement test using real iris coordinates from the face mesh.

## Stack

| Concern | Choice |
|---|---|
| UI runtime | React 19, Vite 7, TypeScript 5 (strict) |
| Vision | `@mediapipe/tasks-vision` (Face Landmarker, 478 landmarks + iris) |
| Maps | Leaflet 1.9 + React-Leaflet 5 (OpenStreetMap tiles) |
| Styling | Tailwind CSS 4 + `tailwindcss-animate` |
| UI primitives | Radix UI (Tabs, Dialog, Slider, Switch) |
| Notifications | `sonner` toasts + persistent alert feed |
| PWA | `vite-plugin-pwa` with manifest, maskable icon, runtime caching |
| Lint / format | ESLint flat config, typescript-eslint, Prettier |

## Architecture

Feature-first folder layout:

```
src/
  features/
    location/   geo math, scenario builder, location analysis
    motion/     gait classifier, motion simulation
    vision/     useVision hook, EAR + blink, mesh overlay, types
  components/
    ui/         Radix wrappers (Tabs, Dialog, Slider, Switch, Toaster, Button) + shells
    panels/     domain panels (MapPanel, GaitPanel, AlertsPanel, TrendPanel, MemoryGame, ...)
    layout/     AppHeader
    ErrorBoundary.tsx
  hooks/        useAlerts, useLocationTracking, useMotionTracking, useAlertOrchestration, usePersistentState
  lib/          utils, charts (SVG path), tone (semantic color helpers)
  constants/    storage keys, sensor caps, default safe zone
  types/        cross-feature primitives + re-exports
  views/        PatientView, CaregiverView
  App.tsx       composition root: wires sensors → views → orchestration
```

The vision pipeline is a single hook (`useVision`) split into pure helpers (`ear.ts`, `overlay.ts`, `simulation.ts`, `landmarks.ts`) so the inference loop, blink hysteresis, and overlay rendering are independently testable.

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

## Live vs simulated

Real browser features when permitted:
- GPS via `watchPosition`
- Motion via `devicemotion`
- Camera via `getUserMedia`
- Face landmarks via MediaPipe (lazy-loaded, ~140 KB chunk)
- Game sessions and history persisted in `localStorage`

Synthetic fallbacks when permissions are denied or hardware is missing:
- Pre-baked breadcrumb routes (home loop, corridor pacing, prolonged dwelling)
- Synthetic accelerometer streams (normal, shuffling, fall)
- Animated moving target overlay used to demo the gaze pipeline

The Smooth Pursuit Test refuses to score against simulated gaze — it only runs when a live face mesh is locked.

## Limitations

- Frontend-only. No real caregiver delivery (Twilio, push, email). All alerts are local.
- Risk labels are demo heuristics, not clinical scoring.
- The OpenStreetMap tile server is acceptable for low-volume demos; production usage needs a paid tile provider.

## Deploying

The repo is configured for Vercel (`vercel.json`). The PWA service worker is generated at build time and registered on first load.
