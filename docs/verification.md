# Verification checklist

A hands-on guide for proving every feature is real, not simulated. Run through this top-to-bottom; each item tells you what to do, what to expect, and how to confirm the data is genuine.

## How to read each item

- 🔴 **Real** — uses an actual browser API; nothing synthetic.
- 🟡 **Real math on real OR sim data** — the algorithm is real, but the input may be a simulated stream when you don't grant the underlying permission.
- 🔵 **Pure UI** — no sensor at all; just app state and persistence.

## Tools that help you verify

1. **Parameters → Diagnostics** (bottom-right floating button → modal). Shows for every sensor:
   - Source pill: `Live` (real device data), `Simulated` (synthetic), `Off` (nothing flowing).
   - A live detail line (e.g. "23 m from safe zone · last fix 2s ago").
   - Sample/breadcrumb counts.
2. **Browser DevTools console**. The vision loop logs occasional debug info (face count, EAR, blink rate). Fall classifier and orchestration alerts also log when triggered.
3. **localStorage inspector** (DevTools → Application → Local Storage). Every persistence key is prefixed `cognitrack.*`.
4. **Network tab**. On first camera enable you should see a request to `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision*` (the wasm) and `storage.googleapis.com/mediapipe-models/face_landmarker/*` (the model).

## Default state to verify before testing anything

Open Parameters. **Simulations should be off.** Diagnostics should show:

| Sensor | Source pill |
|---|---|
| Location | Off |
| Motion | Off |
| Camera | Off |
| Vision | Off |

If anything shows `Simulated` or `Live` already, click the master simulation toggle off and reload. Now you have a clean baseline.

---

## 🔴 Geolocation (real GPS)

**To verify it's REAL:**

1. Patient view → **Home**. Scroll to the **Health monitoring** card.
2. Click **Enable location**. The browser asks for geolocation permission. Grant it.
3. The card flips to a green "Tap to turn off" state.
4. Open **Parameters → Diagnostics**. Location source pill shows `Live`. The detail line shows your real distance from the saved safe zone, with the latest fix timestamp.
5. Caregiver view → **Map**. A breadcrumb dot appears at your real location (lat/lng).
6. localStorage `cognitrack.trail` now contains points with `simulated: false`.

**To prove the math is REAL even when fed simulated data:**

1. Toggle simulations on in Parameters; Location row in Diagnostics flips to `Simulated`.
2. Distance from safe zone updates automatically as the simulated route plays.
3. Drag the safe-zone marker on the Map far away. Distance jumps.
4. `outOfBounds` flips to true → danger alert "Out-of-bounds excursion" appears in the caregiver Alerts feed. That alert exists because the real haversine math classified the simulated breadcrumb as breaching the geofence.

## 🔴 DeviceMotion (real accelerometer)

**To verify it's REAL (mobile / iOS especially):**

1. Patient view → **Home → Health monitoring** card.
2. Click **Enable movement**. On iOS Safari you'll get a permission prompt; grant it. On desktops without an accelerometer the request will fail silently.
3. Diagnostics: Motion source pill should be `Live`. Sample count climbs as you move the device.
4. Caregiver → **Gait** scene. The waveform pulses as you walk or shake the phone.
5. Walk steadily for ~10 seconds. The classifier settles on `Normal`.
6. **Drop the device on a soft surface** (or hard-shake it briefly): the magnitude spike + post-impact stillness can trigger `Fall detected`.

> **Note:** if the motion API isn't available (e.g. desktop without an IMU), the enable button reports the failure and the row drops back to `Off`. The toast surfaces the message. Use simulations to drive gait demos in that case.

**To verify simulated motion drives REAL gait math:**

1. Parameters → simulations on → Gait profile = **Fall event**.
2. Caregiver → Gait scene. The waveform starts streaming. Watch the magnitude line spike around the 2.3-second mark every cycle.
3. Within a few seconds you should see:
   - Risk score jump to ~98%
   - Label flip to **Fall detected**
   - A danger alert appear in the alerts feed: "Fall signature detected"
4. Switch Gait profile to **Shuffling**. After ~5 seconds, label changes to **High fall risk** and a warning alert fires: "Shuffling gait pattern".
5. Switch to **Normal**. Label settles back.

**Confirming the math is real:** there's no canned "if scenario === fall then alert"; the alert comes from `detectFallSignature` actually finding a 6.5g spike + post-impact stillness in the synthetic samples. You can verify by setting Gait profile to Normal and waiting — no fall alert ever fires from normal data.

## 🔴 Camera + face mesh (real MediaPipe)

This is the most testable real pipeline.

**Steps:**

1. Patient view → **Eye check**. The compact CTA card shows "Camera off".
2. Click **Enable camera**. Browser asks for camera permission. Grant it.
3. Network tab: see the request to `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@.../wasm/...` and to `storage.googleapis.com/mediapipe-models/face_landmarker/...task`. **These are real downloads.**
4. The CameraStage flips to a dark live stage, you see your video, then a green wireframe mesh starts drawing on your face.
5. Open Parameters → Diagnostics. Vision row shows:
   - Source pill: `Live mesh`
   - Detail: "478 landmarks · EAR 0.30 · 14 blinks/min" (numbers vary)
   - The numbers update in real time
6. Close one eye briefly: EAR drops, blink count increments, blink rate goes up.

**To prove it's NOT simulated:**

- Move your head out of frame. Diagnostics shows source = `Searching` — meaning the camera is on but no face is locked. With a synthetic stream, no such state would happen.
- Block the lens with your hand. Same: `Searching`.
- Disable the camera (toggle in the sensor area, or close the tab). Source flips to `Off`, all metrics zero.

## 🟡 EAR + Blink detection (real math, real input when camera is on)

1. With the camera on and your face locked, watch the EAR field.
2. Open and close your eyes naturally. EAR should drop below 0.20 during each blink and recover to ~0.28–0.32 when open.
3. After ~15 seconds of natural blinking, blinks/min stabilizes at a real number (typically 12–18 for a relaxed adult).
4. Try **fast blinking** for 10 seconds. Blink rate climbs above 25 → triggers ocular risk = `Moderate` then `High`.
5. Try **stare without blinking** for 30+ seconds. Blink rate drops below 8 → triggers `Moderate` then `High`.

The thresholds (`< 8` or `> 32` per minute = +3 score) come from clinical literature on adult blink patterns. They're hardcoded in `features/vision/ear.ts` `assessOcularRisk`.

## 🟡 Iris position + Smooth Pursuit Test

1. Camera on, face locked.
2. Patient view → **Pursuit**.
3. The "Camera needed" empty state is gone (because the mesh is locked). You see the test stage with a "Start test" button.
4. Click **Start test**. 3-second countdown, then a cyan target moves in a circle.
5. Follow the target with your eyes — keep your head still.
6. After 15 seconds, results appear: pursuit gain, accuracy, saccade rate, latency.

**To prove the analyzer is real:**

- Run the test once normally. Note the gain (likely 0.7–1.1 for a healthy adult).
- Run again but **stare straight ahead** without following the target. Gain drops near 0 (eye velocity ≈ 0, target velocity ≈ 30 %/s). Risk classified as `High`.
- Run once more but **make deliberate fast saccades** (jerky eye movements). Saccade rate climbs above 1.5/s. Risk becomes `High`.
- Open Caregiver → **Vision**. Each test you ran is in the "Recent sessions" list with a timestamp. Click around — these are real persisted entries (`localStorage.cognitrack.pursuitHistory`).

## 🔴 Cognitive games — Sequence recall

1. Patient view → **Memory** → Sequence tab is selected by default.
2. Click **Start session**. Three tiles flash in order. Repeat them by tapping.
3. If correct, span advances to 4. Repeat. If wrong, session ends.
4. Open Caregiver → **Cognition**. Latest session appears in the trend chart with span and reaction time.
5. Run another session. Both points appear, line connects them.

**To prove decline detection is real:**

1. Run several easy successful sessions to establish a baseline of, say, span 5 with reaction ~800ms.
2. Run one bad session — fail at span 3 deliberately. Reaction time slow.
3. After the bad session ends, **a warning alert appears** in the caregiver alerts feed: "Cognitive decline signal" with the actual numbers comparing baseline vs current.

The math is in `compareCognitionSession` — `memorySpan ≤ baseline - 1 OR avgReaction ≥ baseline × 1.2`.

## 🔵 Reasoning game — Pattern Ladder

1. Patient view → **Memory** → Patterns tab.
2. Click **Start reasoning set**. 5 rounds.
3. The arithmetic and growing-gap tasks have unambiguous correct answers. The alternating task pattern is +add, -sub, +add, -sub — so the next is -sub.
4. Verify by mental math. The "correct" toast you get matches the unambiguous answer.

(Historical note: the alternating-task answer used to be wrong by a fixed bug. Fixed in commit `2830480`. If you ever see a clearly-wrong "correct" answer claim, it's a regression.)

## 🔵 Visual Search

1. Memory → Scan tab → Start. 6 rounds of finding a target pair like `7H` among confusable distractors.
2. Click any cell — if it matches the target, it's correct.
3. After 6 rounds the summary shows your accuracy and avg reaction.

## 🔵 Care features — Profile, Contacts, Reminders, Memories

These are pure CRUD against localStorage. Every change in the caregiver Manage scene reflects immediately in the patient view.

1. Caregiver → **Manage**.
2. Edit the patient name. Save isn't a separate step — every keystroke is persisted.
3. Switch to patient view → **Profile**. Name is updated.
4. Caregiver → Manage → Add a contact. Switch to patient → **People**. Contact is there with photo (initials avatar if no photo set).
5. Caregiver → Manage → Add a reminder for `08:00` labeled "Test". Patient → **Home**. Reminder appears with time. Tap it. The bell badge updates.
6. Patient → click the **bell** in the topbar. The PatientNotificationsDialog opens — your test reminder is there as completed.
7. Open localStorage. Keys `cognitrack.profile`, `cognitrack.contacts`, `cognitrack.reminders`, `cognitrack.memories` should reflect your changes as JSON.

## 🔴 Map + Safe zone

1. Caregiver → **Map**. The map renders OpenStreetMap tiles. **Real tiles** — see the Network tab requesting `tile.openstreetmap.org`.
2. Drag the cyan marker. Coordinates in the side card update.
3. Move the radius slider. The translucent circle on the map resizes.
4. Reload the page. Marker stays where you put it (`localStorage.cognitrack.safeZone`).

## 🔵 Alerts dedupe

1. With simulations on and Location route = Prolonged dwelling, wait for the dwelling alert to fire.
2. Don't dismiss it. Wait several seconds. The same alert does **not** re-fire — `useAlertOrchestration`'s guardRef + the alert store's dedupeKey prevents it.
3. Switch route to Home loop, then back to Dwelling. After a fresh dwelling event the alert fires again (the guard reset).

## 🔵 Persistence

1. Run several memory games, drag the safe zone, complete some reminders, mark a contact as emergency.
2. Reload the page. Everything should be exactly where you left it.
3. Open Parameters → Reset all local data. Everything goes back to factory defaults — DEFAULT_PROFILE, DEFAULT_CONTACTS, DEFAULT_REMINDERS, DEFAULT_MEMORIES, empty trail, empty game history, etc.

## What's NOT in scope to verify

- Backend persistence (none exists)
- Real ML model retraining (we use the pretrained MediaPipe Face Landmarker; we don't train or fine-tune)
- Voice picker (uses browser default voice; no UI to pick)
- Real GPS / motion enabling is now wired on the patient Home (Health monitoring card)

## If anything is broken

1. Check the Diagnostics panel first — it'll tell you which sensor is in which state.
2. Open the browser console for errors (especially from `useVision` — the MediaPipe loader logs failures clearly).
3. Compare what you see against what this doc claims should happen. If they differ, file an issue against the offending feature.
