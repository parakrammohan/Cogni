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
├── App.tsx                              composition root
├── main.tsx                             entry
├── index.css                            tokens, animations, leaflet overrides, prefers-reduced-motion
├── components/
│   ├── ErrorBoundary.tsx
│   ├── SmoothPursuitTest.tsx            standalone test component
│   ├── layout/
│   │   ├── AppHeader.tsx                brand + view toggle + Guide
│   │   └── BottomNav.tsx                mobile-first nav, becomes a desktop rail
│   ├── panels/
│   │   ├── AlertsPanel.tsx              alert feed (used in caregiver + patient home)
│   │   ├── GaitPanel.tsx                live SVG waveform
│   │   ├── MapPanel.tsx                 Leaflet + safe-zone slider
│   │   ├── MemoryGame.tsx               cognition tab hub
│   │   ├── ReasoningGame.tsx            pattern-ladder game
│   │   ├── SequenceRecallGame.tsx       3x3 spatial recall
│   │   ├── TrendPanel.tsx               cognitive trend SVG chart
│   │   └── VisualSearchGame.tsx         target-scan game
│   └── ui/                              Radix-based primitives + small surfaces
│       (Badge, Button, ControlDock, Dialog, OnboardingGuide,
│        SectionShell, SensorButton, SensorStatusGrid, Slider,
│        StatusBoard, SurfaceCards, Switch, Tabs, Toaster)
├── constants/
│   └── app.ts                           storage keys, sensor caps, default safe-zone
├── features/
│   ├── location/lib/
│   │   ├── geo.ts                       haversine, offsetCoord, toLocalMeters
│   │   ├── location.ts                  analyzeLocation + detectPacing/Dwelling
│   │   └── scenarios.ts                 simulated route fixtures
│   ├── motion/lib/
│   │   ├── gait.ts                      analyzeGait + fall signature
│   │   └── motion-simulation.ts         normal / shuffling / fall samples
│   └── vision/
│       ├── CameraStage.tsx              persistent video+canvas surface
│       ├── ear.ts                       6-point EAR + BlinkDetector + risk
│       ├── landmarks.ts                 MediaPipe landmark indices
│       ├── overlay.ts                   pure canvas drawer
│       ├── simulation.ts                fallback animated target
│       ├── types.ts                     VisionMetrics, VisionDebug
│       └── useVision.ts                 the unified hook
├── hooks/
│   ├── useAlertOrchestration.ts         dedupe'd alert emission from sensor outputs
│   ├── useAlerts.ts                     in-memory alert store
│   ├── useLocationTracking.ts           GPS or simulated breadcrumbs
│   ├── useMotionTracking.ts             DeviceMotion or simulated samples
│   └── usePersistentState.ts            localStorage-backed useState
├── lib/
│   ├── charts.ts                        SVG path builder
│   ├── storage.ts                       safeRead/safeWrite for localStorage
│   ├── tone.ts                          centralized AlertSeverity helpers
│   └── utils.ts                         cx, clamp, average, stdDev, formatters
├── types/
│   └── app.ts                           cross-feature primitives
└── views/
    ├── CaregiverView.tsx                operations dashboard
    ├── PatientView.tsx                  scene shell with persistent CameraStage
    └── patient/
        ├── HomeScene.tsx                hero + quick actions
        ├── OcularScene.tsx              live ocular readings
        ├── PursuitScene.tsx             smooth-pursuit test wrapper
        └── CognitiveScene.tsx           cognitive games hub
```

## Data flow

### Sensors → metrics
- `useLocationTracking(initialBreadcrumbs, safeZone)` → `LocationAnalysis` (geofence, pacing, dwelling)
- `useMotionTracking()` → `GaitAnalysis` (label, riskScore, signal breakdown)
- `useVision()` → `VisionMetrics` (EAR, blink rate, fixation, iris position, risk)

Each hook supports a **live mode** (real browser API) and a **simulation mode** (synthetic data for demos). Mode is decided by whether the user has granted permission and whether the API is available.

### Metrics → alerts
`useAlertOrchestration` watches all three metric streams and emits dedupe'd alerts:

| Trigger | Severity | Notes |
|---|---|---|
| `locationAnalysis.outOfBounds` | danger | Geofence breach; auto-resets when patient returns |
| `locationAnalysis.dwelling.active` | danger | 15-min low-movement outside zone |
| `gait.fallDetected` | danger | Acceleration spike + post-impact stillness |
| `gait.label === "High fall risk"` | warning | Shuffling pattern detected |
| `visionMetrics.risk === "High"` | warning | Atypical blink rate or instability |

Cognitive sessions flow through `compareCognitionSession` instead — they emit either an info "session logged" or a warning "decline signal" depending on baseline comparison.

### Alerts → UI
- The persistent feed lives in `useAlerts` (in-memory; alerts dismiss on user action or page reload).
- Toast surface (sonner) is wired in for future use; persistent alerts dominate today.

### Persistence
`usePersistentState` writes JSON-serialized values to `localStorage`. Keys live in `constants/app.ts`. Notably:

- `cognitrack.trail` — only **non-simulated** breadcrumbs are persisted, so demo sessions don't pollute storage.
- `cognitrack.gameHistory` — capped at the last 30 sessions.
- `cognitrack.safeZone` — survives reloads.
- `cognitrack.settings` — voice toggle.
- `cognitrack.onboardingGuide` — `acknowledged` flag.

## The vision pipeline lives at `App.tsx` root

`useVision` returns `videoRef` and `canvasRef`. These refs are forwarded down into PatientView's `CameraStage`, which is **always mounted** even when the user is not on the Eye Check scene. This means:

- The camera stream stays active across navigation.
- MediaPipe inference keeps producing metrics in the background.
- The Smooth Pursuit Test always has a live `irisPosition` available when the user opens it.

This is the key behavioral fix versus the original prototype — switching tabs no longer tore down the inference loop.

## Performance posture

- The vision RAF loop **pauses** when `document.hidden` is true.
- `analyzeLocation` is memoized on `[breadcrumbs, safeZone]` so it doesn't recompute pacing detection (O(n²)) on every render.
- MediaPipe model + wasm are lazily fetched on first camera enable; the SDK chunk is `vision-runtime` (~140 KB gzipped).
- Service worker (PWA) caches the wasm + model on first load; subsequent visits are instant.

## Browser API reality check

| API | Required for | Fallback |
|---|---|---|
| `navigator.geolocation.watchPosition` | Live GPS | Pre-baked breadcrumb routes (home loop / pacing / dwelling) |
| `DeviceMotionEvent` | Live gait | Synthetic accelerometer scenarios (normal / shuffling / fall) |
| `getUserMedia` + WebGL | Face mesh | Animated moving-target overlay; pursuit test gracefully refuses to score |
| `localStorage` | Persistence | Quietly noops (errors swallowed in `safeWrite`) |
| `speechSynthesis` | Voice prompts | Voice toggle off → silent |

Every fallback is intentional. The detector logic, alert pipeline, and games all keep working without any sensor.

## Build artifacts

- `dist/index.html` — entry
- `dist/assets/*.js` — code-split bundles (`index`, `vision-runtime`, `map-runtime`)
- `dist/sw.js` + `dist/workbox-*.js` — service worker
- `dist/manifest.webmanifest` — PWA manifest
- `dist/registerSW.js` — auto-registers the SW

## Where to extend

- New sensor → add a `useThingTracking` hook + `analyzeThing` helper, fold into `useAlertOrchestration`.
- New scene → add `views/patient/NewScene.tsx`, register in `BottomNav` and the `AnimatePresence` block in `PatientView.tsx`.
- New caregiver section → drop another `<SectionShell>` into `CaregiverView`.
