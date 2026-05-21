# Motion / gait pipeline

`useMotionTracking` listens to `DeviceMotionEvent` (or simulates it on devices without a sensor) and feeds samples into `analyzeGait`, the variance-based classifier in `src/features/motion/lib/gait.ts`.

## Sample shape

```ts
interface MotionSample {
  // Linear acceleration (m/s²)
  x: number;            // lateral
  y: number;            // forward/back
  z: number;            // vertical
  magnitude: number;    // sqrt(x² + y² + z²)
  // Rotation rate from DeviceMotionEvent.rotationRate (deg/s).
  // alpha = around Z, beta = around X, gamma = around Y.
  // Many laptops / some browsers return null for rotationRate;
  // in that case these fields are zero and the gait panel auto-
  // hides the rotation grid so the user doesn't see four flat lines.
  rotX: number;
  rotY: number;
  rotZ: number;
  rotMagnitude: number; // sqrt(rotX² + rotY² + rotZ²)
  timestamp: number;
}
```

Samples are smoothed before storage: each new raw sample is averaged against the previous 5 samples (`motionRawRef.current.slice(-5)`) — same six-point moving average for linear and rotational components. Magnitudes are computed on the smoothed values.

`GaitPanel` renders two stacked grids: 4 sparklines for linear acceleration (X / Y / Z / magnitude) and 4 for rotation rate (β pitch / γ roll / α yaw / magnitude). Each sparkline measures its own container width with a `ResizeObserver` and draws the path against real pixel coordinates so the curve keeps its natural aspect ratio at any breakpoint — no `preserveAspectRatio="none"` stretching.

The store is capped at `MAX_MOTION_SAMPLES = 220` (~7 seconds at 30 Hz).

## Live vs simulated

`useMotionTracking({ simulate })` defaults to `motionStatus === "offline"` when `simulate` is false. Three states:

- **`"live"`**: `addEventListener("devicemotion", …)` + `requestPermission()` on iOS. Samples come in at the device's native rate.
- **`"simulation"`**: a 33 ms `setInterval` (~30 Hz) calls `makeMotionSample(scenario, elapsedSeconds)`. Three scenarios:
  - `normal` — small lateral sway, regular vertical bounce, magnitude ~1.0 ± 0.3.
  - `shuffling` — reduced vertical, more lateral noise, magnitude flatter.
  - `fall` — 2 seconds of normal walking, then a single ~5 g impact spike, then 4 seconds of near-zero motion. Designed to trip the fall classifier.
- **`"offline"`**: no samples generated. `gait.label` stays `"Calibrating"`. The GaitPanel shows a "No motion data" empty state.

Simulations are off by default. Toggle them on from the **Parameters** modal (bottom-right floating button); pick the gait scenario in the same modal.

## What `analyzeGait` does

It runs over the last 150 samples (~5 seconds). Returns `"Calibrating"` if fewer than 30 are available.

```ts
xs = recent.map(s => s.x); ys = ...; zs = ...; mags = recent.map(s => s.magnitude);
xStd = stdDev(xs); yStd = stdDev(ys); zStd = stdDev(zs); magStd = stdDev(mags);
peakMag = Math.max(...mags);
```

### Fall signature classifier

We scan the window for a **spike + stillness** pattern:

```ts
for (let i = 8; i < recent.length - 24; i++) {
  if (recent[i].magnitude > 6.5 g) {           // peak threshold
    const tail = recent.slice(i + 1, i + 26);   // ~26 samples after = ~0.85 s
    if (stdDev(tail.map(s => s.magnitude)) < 0.12) {
      fallDetected = true; break;
    }
  }
}
```

In English: if any sample exceeded 6.5 g, AND the ~26 samples that followed had near-zero motion variance, that's a fall signature. The `fall` simulated scenario is hand-tuned to clear both gates.

### Shuffling pattern

```
shuffling = zStd < 0.2 && yStd < 0.22 && xStd > 0.18
```

Reduced vertical lift (`zStd`), reduced forward drive (`yStd`), but elevated lateral drift (`xStd`) — characteristic of an unstable shuffling gait.

### Risk score

Five **named signals** (each in 0..1) feed into the risk score:

```
verticalLift          = clamp((0.24 - zStd) / 0.24, 0, 1)
forwardConsistency    = clamp((0.26 - yStd) / 0.26, 0, 1)
lateralDrift          = clamp((xStd - 0.10) / 0.28, 0, 1)
impactSpike           = clamp((peakMag - 3.5) / 3.2, 0, 1)
postImpactStillness   = clamp((0.16 - magStd) / 0.16, 0, 1)
```

Then a weighted blend, clamped to [0.12, 0.92]:

```
baseRisk = 0.12
         + 0.22 * verticalLift
         + 0.16 * forwardConsistency
         + 0.28 * lateralDrift
         + 0.12 * impactSpike
         + 0.10 * postImpactStillness
```

Weights chosen so that lateral drift dominates (most predictive of shuffling), with vertical lift as a strong secondary signal.

### Final label

```
if   fallDetected         → "Fall detected"  (riskScore = 0.98)
elif shuffling || baseRisk >= 0.72 → "High fall risk" (max(baseRisk, 0.78))
elif irregular  || baseRisk >= 0.46 → "Irregular"     (max(baseRisk, 0.54))
else                              → "Normal"          (baseRisk)
```

`irregular = !fallDetected && !shuffling && zStd < 0.45` — a catch-all for gait that isn't classically shuffling but also isn't smooth.

## Output shape

```ts
{
  label: "Calibrating" | "Normal" | "Irregular" | "High fall risk" | "Fall detected";
  color: string;          // tailwind text-* class
  zStd, yStd, xStd: number;
  magnitudeAvg, magnitudeStd, peakMagnitude: number;
  fallDetected: boolean;
  riskScore: number;
  signals: {
    verticalLift, forwardConsistency, lateralDrift, impactSpike, postImpactStillness;
  };
}
```

The caregiver dashboard uses `signals` to render the four small cards under the risk gauge.

## Alerts

`useAlertOrchestration` watches the gait label:

| Condition | Severity | Title |
|---|---|---|
| `gait.fallDetected` | danger | "Fall signature detected" |
| `gait.label === "High fall risk"` | warning | "Shuffling gait pattern" |

Alerts fire on the rising edge — when the condition becomes true. They auto-reset (the dedupe guard goes back to false) when the condition becomes false, so a new event re-alerts.

## Live waveform

`GaitPanel.tsx` renders an SVG dual-line chart of the last 90 samples (~3 seconds): cyan = z-axis (vertical), orange = magnitude. The chart is hand-rolled; no chart library.

## Limitations

- The 0.85-second post-impact window is hardcoded. Long, slow falls (collapsing furniture-style) may not register if the patient stays in motion afterward.
- Real `DeviceMotionEvent` data on iOS requires a permission gate. If the user denies, we drop to simulation silently.
- We don't compensate for device orientation changes mid-stream. If the patient flips the phone, the X/Y/Z axes swap meaning.
- This is **not an IMU sensor fusion solution**. It's a heuristic. The "Fall detected" label is a cue to check on the patient, not a clinical event.
