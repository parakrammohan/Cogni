# Architecture

## Stack at a glance

| Concern | Choice | Why |
|---|---|---|
| UI runtime | React 19 + Vite 7 + TypeScript 5.9 (strict) | Modern, fast HMR, real type-safety |
| Vision | `@mediapipe/tasks-vision` Face Landmarker | Tiny chunk (~140 KB) vs TF.js's 1.6 MB; modern Promise API; ships 478 landmarks + iris |
| State | Local React hooks + `localStorage` via `usePersistentState` | No backend; cross-cutting state is small |
| Maps | Leaflet 1.9 + react-leaflet 5 + OpenStreetMap tiles | Free, no key required for demo |
| UI primitives | Radix UI (Tabs, Dialog, Slider, Switch, Tooltip) | Real keyboard+ARIA without rolling our own |
| Animation | framer-motion | Used sparingly for scene transitions |
| Toasts | `sonner` | Persistent alerts go to the in-app feed; ephemeral info goes to toasts |
| Styling | Tailwind v4 + `tailwindcss-animate` | One source of truth for tokens |
| PWA | `vite-plugin-pwa` | Manifest + service worker with runtime caching for MediaPipe wasm/model |

## Folder layout

```
src/
├── App.tsx                              composition root: orchestrates state + routes views
├── main.tsx                             entry
├── index.css                            tokens, animations, prefers-reduced-motion
├── components/
│   ├── ErrorBoundary.tsx
│   ├── SmoothPursuitTest.tsx            Pursuit test stage with live tracking + result tiles
│   ├── layout/
│   │   ├── AppShell.tsx                 adaptive shell (sidebar on lg+, bottom nav on mobile)
│   │   ├── Sidebar.tsx                  desktop-only collapsible left rail
│   │   ├── BottomNav.tsx                mobile-only bottom tab bar
│   │   └── TopBar.tsx                   sticky topbar with title, mode badge, bell button
│   ├── panels/
│   │   ├── AlertsPanel.tsx              caregiver-focused alert feed (severity-sorted)
│   │   ├── GaitPanel.tsx                live SVG waveform with empty state
│   │   ├── MapPanel.tsx                 Leaflet + safe-zone slider (drag-only)
│   │   ├── MemoryGame.tsx               cognitive game switcher (Sequence / Reasoning / Search)
│   │   ├── ReasoningGame.tsx            pattern-ladder game
│   │   ├── SequenceRecallGame.tsx       3x3 spatial recall, adaptive span
│   │   ├── TrendPanel.tsx               cognitive trend SVG chart with empty state
│   │   └── VisualSearchGame.tsx         target-scan game
│   └── ui/                              Radix-based primitives + small surfaces
│       ├── Avatar.tsx                   photo-or-initials with deterministic hue
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── Dialog.tsx                   Radix Dialog wrapper
│       ├── OnboardingGuide.tsx          first-run guide (view-aware)
│       ├── ParametersModal.tsx          operator settings + simulation toggle
│       ├── PatientNotificationsDialog.tsx  patient-side bell content
│       ├── SectionShell.tsx
│       ├── SensorButton.tsx
│       ├── SensorStatusGrid.tsx
│       ├── Slider.tsx
│       ├── StatusBoard.tsx
│       ├── SurfaceCards.tsx
│       ├── Switch.tsx
│       ├── Tabs.tsx
│       └── Toaster.tsx                  sonner mount
├── constants/
│   └── app.ts                           storage keys, sensor caps, default safe-zone
├── features/
│   ├── care/
│   │   └── types.ts                     PatientProfile, CareContact, CareReminder, CareMemory + defaults
│   ├── location/lib/
│   │   ├── geo.ts                       haversine, offsetCoord, toLocalMeters
│   │   ├── location.ts                  analyzeLocation + detectPacing/Dwelling
│   │   └── scenarios.ts                 simulated route fixtures
│   ├── motion/lib/
│   │   ├── gait.ts                      analyzeGait + fall signature classifier
│   │   └── motion-simulation.ts         normal / shuffling / fall samples
│   └── vision/
│       ├── CameraStage.tsx              persistent video+canvas surface (refs stable)
│       ├── ear.ts                       6-point EAR + BlinkDetector + ocular risk
│       ├── landmarks.ts                 MediaPipe landmark indices
│       ├── overlay.ts                   pure canvas drawer
│       ├── pursuit-analysis.ts          gain / accuracy / saccadeRate / latency
│       ├── simulation.ts                fallback animated target
│       ├── types.ts                     VisionMetrics, VisionDebug, OcularRisk, TrackingMode
│       └── useVision.ts                 unified hook with simulate flag
├── hooks/
│   ├── useAlertOrchestration.ts         dedupe'd anomaly alert emission (caregiver feed)
│   ├── useAlerts.ts                     in-memory alert store
│   ├── useLocationTracking.ts           GPS or simulated breadcrumbs (gated by simulate flag)
│   ├── useMotionTracking.ts             DeviceMotion or simulated samples (gated)
│   └── usePersistentState.ts            localStorage-backed useState
├── lib/
│   ├── charts.ts                        SVG path builder
│   ├── storage.ts                       safeRead/safeWrite for localStorage
│   ├── tone.ts                          centralized AlertSeverity helpers
│   └── utils.ts                         cx, clamp, average, stdDev, formatters
├── types/
│   └── app.ts                           cross-feature primitives + re-exports
└── views/
    ├── PatientView.tsx                  AppShell + scene router with persistent CameraStage
    ├── CaregiverView.tsx                AppShell + scene router for caregiver scenes
    ├── patient/
    │   ├── HomeScene.tsx                live clock, reminders, contacts, today's checks
    │   ├── OcularScene.tsx              live ocular biomarker readouts
    │   ├── PursuitScene.tsx             smooth-pursuit test wrapper
    │   ├── CognitiveScene.tsx           memory games + voice toggle
    │   ├── PeopleScene.tsx              contacts with call/message buttons
    │   ├── MemoriesScene.tsx            photo gallery
    │   └── ProfileScene.tsx             read-only patient profile
    └── caregiver/
        ├── OverviewScene.tsx            patient header + quick metrics + recent activity
        ├── MapScene.tsx                 spatial telemetry
        ├── AlertsScene.tsx              full anomaly feed
        ├── GaitScene.tsx                gait waveform + risk breakdown
        ├── VisionScene.tsx              unified Eye Check + Pursuit history
        ├── TrendsScene.tsx              cognitive trend chart
        └── ManageScene.tsx              profile/contacts/reminders/memories editor
```

## Adaptive shell

`AppShell<T>` exposes a sidebar item list and renders:

- **Desktop (lg+)**: collapsible left sidebar (`Sidebar.tsx`) + sticky topbar (`TopBar.tsx`) + main content. Sidebar collapse state is persisted to localStorage.
- **Mobile**: same topbar + main content + bottom navigation (`BottomNav.tsx`). The Parameters FAB sits above the bottom nav.

Both views (Patient, Caregiver) provide their own sidebar items and active scene state. The shell is generic over the scene-id type.

## Simulation toggle

`simulationsEnabled: boolean` (persisted at `cognitrack.simulations`, default **false**) is the master gate for synthetic sensor data.

- When `false`: location / motion / vision hooks default to `"offline"`. No fake data flows. Panels render empty/CTA states.
- When `true`: hooks fall back to simulation mode whenever the real sensor isn't `"live"`. The simulator scenarios in Parameters drive what happens.

Each hook accepts `{ simulate: boolean }` in its props and reacts to the flag flipping. Toggling simulations on mid-session causes the synthetic streams to start; toggling off clears any synthetic samples that had accumulated.

## Data flow

### Sensors → metrics
- `useLocationTracking({ initialBreadcrumbs, safeZone, simulate })` → `LocationAnalysis`
- `useMotionTracking({ simulate })` → `GaitAnalysis`
- `useVision({ simulate })` → `VisionMetrics`

Each hook supports a **live mode** (real browser API) and a **simulation mode** (synthetic data). Mode is decided by:
1. Whether the user has granted permission and the API succeeded → "live"
2. Whether `simulate === true` → simulation
3. Otherwise → "offline" (no data)

### Metrics → alerts (caregiver-side only)
`useAlertOrchestration` watches all three metric streams and emits dedupe'd alerts:

| Trigger | Severity | Notes |
|---|---|---|
| `locationAnalysis.outOfBounds` | danger | Geofence breach |
| `locationAnalysis.dwelling.active` | danger | 15-min low-movement outside zone |
| `gait.fallDetected` | danger | Acceleration spike + post-impact stillness |
| `gait.label === "High fall risk"` | warning | Shuffling pattern detected |
| `visionMetrics.risk === "High"` | warning | Atypical blink rate or instability |

Cognitive sessions flow through `compareCognitionSession` and emit either an info ("session logged") or a warning ("decline signal") based on baseline comparison.

### Patient-side notifications
**Different from caregiver alerts.** The bell on the patient view does **not** show clinical anomalies — it shows task-oriented content via `PatientNotificationsDialog`:

- Reminders due now or coming up
- Reminders completed today
- Recent memory-game wins

The `countPatientNotifications()` helper drives the badge count.

### Pursuit test history
`PursuitResult` from `analyzePursuit()` is lifted to App-level state. `App.tsx` wraps each result with an id + timestamp (`StoredPursuitResult`) and persists to `cognitrack.pursuitHistory` (capped at 30). The caregiver Vision scene reads this history and renders the latest plus a recent-sessions list.

### Persistence

`usePersistentState` writes JSON-serialized values to `localStorage`. All keys live in `constants/app.ts`:

| Key | What |
|---|---|
| `cognitrack.gameHistory` | Sequence-recall sessions, capped at 30 |
| `cognitrack.trail` | Real (non-simulated) breadcrumbs only |
| `cognitrack.settings` | `{ voiceEnabled }` |
| `cognitrack.safeZone` | Center + radius |
| `cognitrack.onboardingGuide` | `{ acknowledged }` |
| `cognitrack.profile` | Patient profile |
| `cognitrack.contacts` | Care contacts |
| `cognitrack.reminders` | Daily reminders |
| `cognitrack.memories` | Photo memories |
| `cognitrack.pursuitHistory` | Pursuit test results, capped at 30 |
| `cognitrack.simulations` | Master simulation toggle |
| `cognitrack.activeView` | Patient or Caregiver |
| `cognitrack.sidebarCollapsed` | Sidebar collapse state |

The "Reset all local data" button in Parameters wipes everything and re-seeds defaults.

## The vision pipeline lives at `App.tsx` root

`useVision` returns `videoRef` and `canvasRef`. These refs are forwarded down into `CameraStage`, which is **always mounted** in PatientView even when the user is not on the Eye Check scene. This means:

- The camera stream stays active across navigation.
- MediaPipe inference keeps producing metrics in the background.
- The Smooth Pursuit Test always has a live `irisPosition` available when the user opens it.

`CameraStage` shows two visual states based on `cameraStatus`:
- **Live**: dark surface, live video, mesh overlay, metric chips
- **Off**: cyan/sky CTA card with "Enable camera" button — same visual language as other patient empty states

The `<video>` and `<canvas>` elements are rendered exactly once with stable refs; they fade between opacity-0 (off) and opacity-90 (live) so the wrapper background can show through during the off state.

## Performance posture

- The vision RAF loop **pauses** when `document.hidden` is true.
- `analyzeLocation` is memoized on `[breadcrumbs, safeZone]` so pacing detection (O(n²)) doesn't re-run on every render.
- MediaPipe model + wasm are lazily fetched on first camera enable.
- Service worker (PWA) caches wasm + model after first load.
- When `simulate === false` and camera is off, the canvas clears and the loop publishes a default-zero metrics object — no fake numbers leak into the UI.

## Browser API reality check

| API | Required for | Fallback (when simulations on) | Fallback (when simulations off) |
|---|---|---|---|
| `navigator.geolocation.watchPosition` | Live GPS | Pre-baked breadcrumb routes | "Offline" — empty trail |
| `DeviceMotionEvent` | Live gait | Synthetic accelerometer scenarios | "Offline" — gait stays "Calibrating" |
| `getUserMedia` + WebGL | Face mesh | Animated moving-target overlay | Camera-off CTA on the stage |
| `localStorage` | Persistence | n/a | Quietly noops (errors swallowed) |
| `speechSynthesis` | Voice prompts | n/a | Voice toggle off → silent |

## Build artifacts

- `dist/index.html` — entry
- `dist/assets/*.js` — code-split bundles (`index`, `vision-runtime`, `map-runtime`)
- `dist/sw.js` + `dist/workbox-*.js` — service worker
- `dist/manifest.webmanifest` — PWA manifest
- `dist/registerSW.js` — auto-registers the SW

## Where to extend

- **New sensor** → add a `useThingTracking({ simulate })` hook + `analyzeThing` helper, fold into `useAlertOrchestration`.
- **New patient scene** → add `views/patient/NewScene.tsx`, register in `NAV_ITEMS` in `PatientView.tsx`.
- **New caregiver scene** → add `views/caregiver/NewScene.tsx`, register in `NAV_ITEMS` in `CaregiverView.tsx`.
- **New persistent care data** → add to `features/care/types.ts`, register a storage key, add an editor section to `ManageScene`, surface in the appropriate patient scene.
