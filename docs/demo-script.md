# Demo script

A 5-minute walkthrough optimized for a hackathon judging session. Read the script in full at least once before going live so the cadence feels natural.

## Before you start

- Open Chrome (Edge/Safari also fine, but Chrome's permission flow is fastest).
- Allow camera, location, and motion permissions when prompted.
- Make sure you're on **HTTPS** or **localhost** — sensors won't unlock otherwise.
- Open the app in a browser window sized to a typical phone (e.g. 390 × 844 in DevTools device toolbar) AND have a desktop tab ready, so you can show both.

## Opening (~30 sec)

> "CogniTrack is an Alzheimer's detection and care concept. The patient sees a calm, low-friction app. The caregiver sees an operations dashboard. They share the same live sensors — GPS, motion, camera — and they share the same anomaly engine."

Click **Patient** in the header. Land on the Home scene.

## Patient flow (~2 min)

### Home scene

> "Hero card up top — that one sentence reflects the live state of every sensor. If the patient is out of bounds, you'd see a warmer color and different copy. The three small cards underneath are the three live signals. Below them, three things to do today, each with a duration estimate. Recent activity at the bottom is the actual notification feed — when there are no alerts, it tells you that."

Tap **Eye check** in the bottom nav.

### Eye check (Ocular)

> "I'll enable the camera. The app loads a Face Landmarker model — about 140 KB gzipped — only when needed, so first visit is fast. Once the model loads, you see a sparse mesh, the eye contours in green, and the iris circles in yellow."

Allow camera permission. Wait ~2 seconds for the lock.

> "EAR is the eye-aspect ratio — the standard 6-point formula. Around 0.30 means open, drops below 0.20 during a blink. Blink rate is sliding 60-second window — at 15 seconds in we extrapolate so it's not misleadingly low. Fixation tracks how steady your gaze is, derived from iris-position variance over a 3-second window — independent of blinks, which means closing your eyes naturally doesn't tank fixation."

Blink intentionally a few times — call out that the rate updates live.

### Pursuit test

Switch to the **Pursuit** tab. The camera stays alive across the navigation — that's a deliberate architectural choice; the video element lives at the patient view root.

> "Pursuit test is a 15-second smooth-pursuit assessment. We record the iris path, then compute smoothness as % of low-velocity-change segments, latency as the average gap between target movement and gaze response, accuracy as path adherence, and saccades as the count of jerky movements above a threshold."

Run it once.

### Memory game

Switch to **Memory**.

> "Three games. Sequence recall is a 3×3 Corsi-style spatial span — adaptive difficulty, span starts at 3 and grows. Pattern ladder is inductive reasoning. Target scan is visual search with confusable distractors — H7 vs 7H, that kind of thing."

Play one quick round of sequence recall to log a baseline.

## Switching to caregiver (~30 sec)

Click **Caregiver** in the top header.

> "Same data, operations view. Live sensor states up top. The session that just finished is logged in the trend chart down below. If a future session shows span dropping by 1 or reaction time rising by 20%, the alerts engine fires a 'cognitive decline signal' warning."

## Caregiver flow (~1.5 min)

### Map / wandering

> "Spatial telemetry. The radius slider is the safe-zone perimeter — drag the marker to relocate it. Three things we look for: out-of-bounds excursions, dwelling — which is 'stuck in a 10-meter box outside the safe zone for 15+ minutes' — and pacing — back-and-forth motion in a confined corridor."

Open the **Demo Simulator** (bottom-right floating button). Switch route profile to **Prolonged dwelling**.

> "I just told the location stream to simulate the patient sitting outside the safe zone. After 15 simulated minutes, the alerts engine will fire a 'dwelling / lost anomaly' warning."

You can also point to the alerts feed to show that anomalies dedupe — the same condition doesn't refire on every render.

### Gait analysis

Scroll to **Gait & fall risk**.

> "Live waveform of the last 3 seconds of motion data. Cyan is vertical acceleration; orange is total magnitude. The classifier looks for two patterns: shuffling — reduced vertical, more lateral noise — and falls — a single high-magnitude spike followed by 0.85 seconds of motionlessness."

In the Demo Simulator, switch **Gait profile** to **Fall event**.

> "I just simulated a fall. The classifier should pick up the spike and the post-impact stillness within a few seconds."

The risk score climbs to ~98%, the label changes to "Fall detected", a danger alert fires.

### Ocular biomarkers

Scroll down. Same camera, but with the operator's information density.

### Cognitive trend

Scroll to the bottom.

> "Memory span vs reaction time across the patient's stored sessions. Cyan up = good. Orange down = good."

## Closing (~30 sec)

> "Stack: React 19, MediaPipe Tasks Vision (which replaced TF.js — 92% bundle reduction), Tailwind v4 with Radix primitives for real keyboard accessibility, full PWA with offline service worker caching the model. Everything runs client-side; no backend, no PII leaves the browser. Persistence is localStorage."

> "Limitations: this is hackathon-grade. Risk classifications are heuristic, not clinical. The fall detector is a 6.5 g spike + stillness signature, not an IMU sensor fusion. The blink-rate ranges come from clinical literature but the scoring is hand-tuned. We'd want to validate against actual patients before claiming any of this is medical."

## Backup plays if a sensor fails

| Sensor | If it fails | What to say |
|---|---|---|
| Camera | Permission denied or no webcam | Use the Demo Simulator, but skip the eye check / pursuit test demos. Point out that the app gracefully falls back to a simulated gaze overlay. |
| GPS | No HTTPS or denied | The simulated routes still drive the geofence and dwelling demos. |
| Motion | iOS denial, no DeviceMotion | The simulated gait scenarios still drive the fall demo. |

## Punchlines worth memorizing

- "The vision chunk is 136 KB, down from 1.6 MB on the original prototype."
- "MediaPipe inference happens entirely on-device. The video never leaves the browser."
- "Switching tabs doesn't tear down the camera — the video element lives above the navigation."
- "We use a sliding 60-second window for blink rate, with extrapolation in the first 15 seconds."
- "Fixation is iris-position variance, not eyelid state — blinking doesn't crash it."
- "All persistence is localStorage. No backend, no audit trail. Demo only."

## Things you should not claim

- Don't say "clinically validated" or "FDA-cleared" — neither is true.
- Don't say "diagnoses Alzheimer's" — it screens for risk signals; that's a different statement.
- Don't say the games are "trained on a clinical dataset" — they're not.
