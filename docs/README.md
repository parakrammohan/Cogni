# CogniTrack — Technical Docs

Deep-dive reference for every detection pipeline and game. Every formula, threshold, and risk classifier is explained so you can speak to it during a demo.

## Map of the docs

- [`architecture.md`](./architecture.md) — overall project structure, data flow, state ownership, and the boundary between live sensors and simulated fallback.
- [`vision.md`](./vision.md) — MediaPipe Face Landmarker pipeline, the 6-point Eye Aspect Ratio (EAR), blink detection with hysteresis, fixation derived from iris-position variance, and the ocular risk classifier.
- [`location.md`](./location.md) — geofencing, pacing detection (corridor projection + axis-crossing count), and dwelling detection (rolling bounding box).
- [`motion.md`](./motion.md) — gait variance analysis, fall signature classifier, and how the live waveform on the caregiver dashboard is rendered.
- [`cognition.md`](./cognition.md) — sequence recall, pattern ladder, and visual search games with scoring formulas; cognitive-decline alerting against the rolling baseline.
- [`demo-script.md`](./demo-script.md) — minute-by-minute demo runbook covering both views, what to point at, and graceful fallbacks if a sensor doesn't work.

## Quick map of the code

```
src/features/
  vision/    useVision hook, EAR, blink detector, overlay drawer, MediaPipe Tasks
  location/  geo math, location analysis (geofence, pacing, dwelling)
  motion/    gait classifier, motion sample simulator
src/views/
  PatientView.tsx              shell with bottom-nav + scenes
  CaregiverView.tsx            operations dashboard
  patient/{Home,Ocular,Pursuit,Cognitive}Scene.tsx
src/components/
  ui/        Radix wrappers + design primitives
  layout/    AppHeader, BottomNav
  panels/    Map, Gait, Trend, Alerts, MemoryGame, ReasoningGame, etc.
  ErrorBoundary.tsx
src/hooks/
  useAlerts.ts, useAlertOrchestration.ts, useLocationTracking.ts,
  useMotionTracking.ts, usePersistentState.ts
src/lib/      utils, charts, tone (semantic color helpers)
```

## How everything connects

```
                   ┌─────────────────────────────┐
                   │           App.tsx           │
                   │  (composition + alerts)     │
                   └──┬───────┬──────────┬───────┘
                      │       │          │
       ┌──────────────┘       │          └──────────────┐
       ▼                      ▼                         ▼
┌──────────────┐      ┌────────────────┐      ┌──────────────────┐
│ useLocation  │      │ useMotion      │      │ useVision        │
│ Tracking     │      │ Tracking       │      │ (MediaPipe)      │
└──────┬───────┘      └────────┬───────┘      └────────┬─────────┘
       │ LocationAnalysis      │ GaitAnalysis           │ VisionMetrics
       └────────┬───────────────┴────────────────────────┘
                ▼
       useAlertOrchestration → addAlert → useAlerts (in-memory)
                ▼
            PatientView / CaregiverView
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
   HomeScene      OcularScene     PursuitScene  ...
```

The vision hook is the heaviest piece — it owns the camera lifecycle, model loading, RAF loop, and overlay drawing. Patient/Caregiver views simply read its `visionMetrics` output.
