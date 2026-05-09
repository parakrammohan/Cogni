# Vision pipeline

Everything visual that the demo can claim — face tracking, blink detection, fixation scoring, ocular risk classification — flows through `src/features/vision/`. This document explains every formula and threshold.

## What we use, and why

- **`@mediapipe/tasks-vision`** Face Landmarker (Google's official MediaPipe Tasks SDK). Returns up to 478 normalized landmarks per face per frame, including iris coordinates. Loaded lazily on first camera enable.
- The **model file** (`face_landmarker.task`) and the **wasm runtime** are fetched from CDNs at runtime:
  - `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<version>/wasm` (loader)
  - `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` (model)
- The PWA service worker caches both with `CacheFirst` strategy after the first visit.

## Lifecycle

```
useVision() ─────────────────────────────────────────────────
  videoRef, canvasRef  ──────►  attached to <video>/<canvas>
  enableCamera()       ──────►  getUserMedia → video.srcObject
                              → ensureLandmarker() (loads MediaPipe)
                              → cameraStatus="live", visionStatus="live"
  RAF loop             ──────►  detectForVideo(video, now)
                              → faceLandmarks[0] → metrics + overlay
  disableCamera()      ──────►  stop tracks, clear srcObject
  unmount cleanup      ──────►  landmarker.close()
```

The hook holds three significant pieces of mutable state in refs (so they survive renders):

- `landmarkerRef` — the MediaPipe `FaceLandmarker` instance.
- `blinkDetectorRef` — a `BlinkDetector` instance with hysteresis.
- `irisHistoryRef` — the rolling window of recent iris positions for fixation calc.

## Eye Aspect Ratio (EAR)

The 6-point EAR formula from Soukupová & Čech (2016):

```
EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
```

Six points per eye, where:
- `p1` = outer corner
- `p4` = inner corner
- `p2`, `p3` = upper lid (outer / inner)
- `p5`, `p6` = lower lid (outer / inner, mirrored from upper)

Indices we use (`features/vision/landmarks.ts`):

| | p1 | p2 | p3 | p4 | p5 | p6 |
|---|---|---|---|---|---|---|
| Left eye | 33 | 160 | 158 | 133 | 153 | 144 |
| Right eye | 362 | 385 | 387 | 263 | 380 | 373 |

We compute EAR per eye and average them: `avgEAR = (leftEAR + rightEAR) / 2`.

Typical values: ~0.30 with eyes open, drops below 0.20 during a blink, near 0.10 fully closed.

## Blink detection (hysteresis)

Per-frame EAR is noisy. A naive "EAR < 0.2 = blink" would overcount. We use **temporal hysteresis** — a blink only counts when EAR has been below threshold for `BLINK_CONSEC_FRAMES = 2` consecutive frames, and we wait for EAR to recover before counting again.

Implementation lives in `BlinkDetector.tick(ear)` in `features/vision/ear.ts`:

```ts
EAR_BLINK_THRESHOLD = 0.20
BLINK_CONSEC_FRAMES = 2

if (ear < threshold) {
  consecutiveLow++
  if (consecutiveLow >= 2 && !inBlink) {
    inBlink = true
    record blink timestamp
    return true
  }
} else {
  consecutiveLow = 0
  inBlink = false
}
```

### Blink rate (sliding window, not session-since-start)

The detector keeps an array of blink timestamps in a rolling 60-second window:

```ts
RATE_WINDOW_MS = 60_000
WARMUP_MS      = 15_000
```

After 15 seconds of warmup, `rate = blinks_in_last_60s` (a literal blinks-per-minute count).

Before warmup expires, we **extrapolate** so the UI shows a meaningful number from the first blink:

```
rate = (blinks_so_far × 60_000) / elapsed_ms
```

This avoids the "rate is 1.0 because we've only been running 6 seconds" misleading-low-number bug.

## Fixation (iris-position stability)

**Fixation** measures whether the gaze is steady. Originally we computed it from EAR variance — but EAR varies massively during natural blinking, so fixation would crash every blink. That's wrong.

The fixed metric tracks **iris-position variance** instead. While the eye is open (not mid-blink), we push the average iris position into a rolling 90-frame window (~3 seconds at 30 fps) and compute the standard deviation across X+Y:

```
stdDev = sqrt(varX + varY)
fixation = clamp(100 - stdDev * 12, 0, 100)
```

The multiplier (12) is hand-calibrated: a rock-still gaze gives ~95–100; saccadic motion drops it toward 0; mid-saccade chaos sits around 30–60.

Mid-blink frames (when `BlinkDetector.isBlinking === true`) are excluded from history — the iris isn't visible during a blink, so MediaPipe's iris landmarks would be unreliable.

## Ocular risk classification

`assessOcularRisk(blinkRate, earVariance, avgEAR)` returns one of `"Low" | "Moderate" | "High"`. It's a hand-tuned scoring function, **not a clinical model** — call it a heuristic in any demo:

| Signal | +3 points | +1 point |
|---|---|---|
| Blink rate | < 8 or > 32 /min | < 10 or > 25 /min |
| EAR variance | > 0.005 | > 0.002 |
| Avg EAR | (n/a) | < 0.15 (ptosis) |

| Total score | Risk |
|---|---|
| ≥ 4 | High |
| ≥ 2 | Moderate |
| else | Low |

Why these thresholds: typical adult blink rate is 10–20/min; clinically observed blink rate ranges in Parkinson's and dementia populations include both reductions (<10) and elevations (>30). Erratic patterns (high EAR variance) reflect oculomotor instability. Very low EAR (<0.15) suggests ptosis (drooping eyelids). The scoring lets multiple borderline signals add up to "High" without any single signal needing to be extreme.

## Iris position output

For every live frame, we expose `visionMetrics.irisPosition` as `{x, y}` in the 0–100 % normalized coordinate space (averaged across both irises). This feeds the **Smooth Pursuit Test** which scores how well the user's gaze tracks a moving target.

Critically, **`irisPosition` is `null` whenever we are not in `live-mesh` tracking mode**. This prevents the Smooth Pursuit Test from accidentally scoring against simulated jitter.

## Overlay drawing

`features/vision/overlay.ts` exports two pure functions:

- `drawFaceMesh({ ctx, landmarks, width, height, mirror })` — draws sparse mesh dots, eye contours, and iris circles + crosshairs over the live video.
- `drawSimulationOverlay(ctx, target, gaze, width, height, meta)` — used when the camera is off, animates a moving target with a "simulated gaze" tether.

The mirror flag flips X coordinates so the overlay aligns with the mirrored video (the `<video>` element in `index.css` has `transform: scaleX(-1)` so users see themselves as in a mirror).

## Frame loop and back-pressure

- The RAF loop runs at the browser's preferred refresh rate (typically 60 fps).
- When `document.hidden` is true (background tab), we replace the RAF with a 200 ms `setTimeout` so we don't spin the GPU on a hidden tab.
- `setMetrics` is throttled to `STATE_PUSH_INTERVAL_MS = 140` ms (~7 React renders per second). MediaPipe still runs every frame; we only push to React state ~7×/s to avoid render storms.

## Tracking modes

`visionMetrics.trackingMode` is one of:

- `"simulation"` — camera is off; simulated overlay is drawn.
- `"camera-search"` — camera is on, MediaPipe is loaded, but no face is in frame yet.
- `"live-mesh"` — face is locked, landmarks are flowing, all metrics are real.

The Smooth Pursuit Test only operates in `live-mesh`. The Patient Eye Check scene shows a "Looking for a face…" hint during `camera-search`.

## Limitations

- The model assumes a single face (`numFaces: 1`). Multi-face scenes are clipped to the first detection.
- Iris landmarks are only emitted when the model returns the full 478-landmark set (with `outputFaceLandmarks: true`, default).
- Risk classification is heuristic. **Do not present any of this as a clinical diagnosis in the demo.**
- WebGL inference quality varies by device GPU. We default to `delegate: "GPU"`; if WebGL fails, MediaPipe falls back to wasm-CPU automatically.
