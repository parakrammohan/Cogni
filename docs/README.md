# CogniTrack — Technical Docs

Deep-dive reference for every detection pipeline and game. Every formula, threshold, and risk classifier is explained so you can speak to it during a demo.

## Map of the docs

- [`architecture.md`](./architecture.md) — overall project structure, data flow, the simulation toggle, persistence keys, and the boundary between live sensors and simulated fallback.
- [`vision.md`](./vision.md) — MediaPipe Face Landmarker pipeline, the 6-point Eye Aspect Ratio (EAR), blink detection with hysteresis, fixation derived from iris-position variance, the ocular risk classifier, and the pursuit-test analyzer (gain / accuracy / saccade rate / phase-shift latency).
- [`location.md`](./location.md) — geofencing, pacing detection (corridor projection + axis-crossing count), and dwelling detection (rolling bounding box).
- [`motion.md`](./motion.md) — gait variance analysis, fall signature classifier, and how the live waveform is rendered.
- [`cognition.md`](./cognition.md) — sequence recall, pattern ladder, and visual search games with scoring formulas; cognitive-decline alerting against the rolling baseline.
- [`care.md`](./care.md) — the patient care features (profile, contacts, reminders, memories) and how the caregiver "Manage" scene edits them.
- [`demo-script.md`](./demo-script.md) — minute-by-minute demo runbook for both views, with backup plays if a sensor doesn't work.

## Quick map of the code

```
src/features/
  care/      types + defaults for profile, contacts, reminders, memories
  vision/    useVision hook, EAR, blink detector, overlay, MediaPipe Tasks, pursuit-analysis
  location/  geo math, location analysis (geofence, pacing, dwelling), scenarios
  motion/    gait classifier, motion sample simulator
src/views/
  PatientView.tsx              AppShell + scene router with persistent CameraStage
  CaregiverView.tsx            AppShell + scene router for caregiver scenes
  patient/{Home,Ocular,Pursuit,Cognitive,People,Memories,Profile}Scene.tsx
  caregiver/{Overview,Map,Alerts,Gait,Vision,Trends,Manage}Scene.tsx
src/components/
  ui/        Radix wrappers + design primitives + Avatar + Parameters/Notifications dialogs
  layout/    AppShell, Sidebar (desktop rail), TopBar, BottomNav (mobile)
  panels/    Map, Gait, Trend, Alerts, MemoryGame, ReasoningGame, etc.
  ErrorBoundary.tsx
src/hooks/
  useAlerts, useAlertOrchestration, useLocationTracking, useMotionTracking, usePersistentState
src/lib/      utils, charts, tone, storage
```

## How everything connects

```
                          ┌────────────────────────────────────┐
                          │              App.tsx               │
                          │  state · alerts · persistence root │
                          └──┬───────┬────────────┬────────────┘
                             │       │            │
            ┌────────────────┘       │            └────────────────┐
            ▼                        ▼                             ▼
  ┌──────────────────┐    ┌─────────────────┐         ┌─────────────────────┐
  │ useLocation      │    │ useMotion       │         │ useVision           │
  │   {simulate}     │    │   {simulate}    │         │   {simulate}        │
  └─────────┬────────┘    └────────┬────────┘         └──────────┬──────────┘
            │ LocationAnalysis     │ GaitAnalysis                │ VisionMetrics
            └─────────┬────────────┴─────────────────────────────┘
                      ▼
       useAlertOrchestration ─ addAlert ─► useAlerts (caregiver feed)
                      │
                      ▼
           PatientView / CaregiverView (AppShell)
                      │
   ┌──────────────────┼──────────────────────┐
   ▼                  ▼                      ▼
patient scenes   caregiver scenes   ParametersModal · OnboardingGuide · Toaster
```

The vision hook is the heaviest piece — it owns the camera lifecycle, model loading, RAF loop, and overlay drawing. Patient/Caregiver views simply read its `visionMetrics` output and render `videoRef`/`canvasRef` via the shared `CameraStage`.

## Conventions

- Every sensor hook accepts `{ simulate: boolean }` so the caller decides whether synthetic streams run.
- Cross-feature types live in `src/types/app.ts`; feature-specific types live alongside the feature.
- Tailwind tokens are defined once in `src/index.css`; visual surfaces use them consistently.
- Empty states say "Enable X" rather than rendering misleading zeros.
- Patient bell shows task notifications. Caregiver bell shows clinical alerts. Don't mix them.
