# Demo script

A 5-minute walkthrough optimized for a hackathon judging session. Read once before going live so the cadence feels natural.

## Before you start

- Open Chrome (Edge/Safari also fine, but Chrome's permission flow is fastest).
- Allow camera, location, and motion permissions when prompted — or click **Parameters → Sensor simulation: on** to drive the demo from synthetic data.
- Make sure you're on **HTTPS** or **localhost** — sensors won't unlock otherwise.
- Have both a desktop view (sidebar layout) and a mobile-sized window (bottom nav layout) ready, or use Chrome's device toolbar.

## Two ways to drive the demo

The default state is **simulations off** — sensors stay idle until permissions are granted, and panels show empty / "Enable" CTAs. This makes it obvious which features depend on which permissions.

For the full anomaly story, open **Parameters** (bottom-right floating button) and flip **Sensor simulation: on**. You can then choose route and gait scenarios to drive the alert pipeline without granting real permissions.

## Opening (~30 sec)

> "CogniTrack is an Alzheimer's detection and care concept. The patient sees a calm, low-friction app. The caregiver sees an operations dashboard. They share the same live sensors — GPS, motion, camera — and the same anomaly engine."

You start in **Patient view** (mode persists from last visit; switch via Parameters if needed).

## Patient flow (~2 min)

### Home

> "The home page is your day at a glance. Live clock, today's reminders, three closest contacts as quick-call buttons, today's checks, and a wins feed at the bottom. Recent activity here is task-oriented — completed reminders and game results — not clinical alerts."

Tap one of the reminders to mark it done; the badge count on the bell drops.

Click the bell in the topbar to show the **patient notifications** — upcoming reminders + recent memory-game wins. Notice this is *different* from the caregiver alerts feed.

### Eye check

Tap **Eye check** in the sidebar (or bottom nav on mobile).

> "When the camera is off you get a calm CTA card — same visual language as the other empty states. Enable the camera and the surface flips to a dark live stage with the mesh overlay."

Allow camera permission. Wait for the lock.

> "EAR — the standard 6-point eye-aspect ratio. Around 0.30 means open, drops below 0.20 during a blink. Blink rate uses a sliding 60-second window with extrapolation in the first 15 seconds, so it's never misleadingly low. Fixation tracks iris-position variance over a 3-second window, independent of eyelid state — closing your eyes naturally doesn't crash it."

### Pursuit test

Tap **Pursuit** in the sidebar.

> "Same camera stream — the video element lives at the patient view root, so navigation doesn't tear it down. Pursuit test is a 15-second smooth-pursuit assessment with circular target motion."

Run it once.

> "Four metrics from the analyzer: pursuit gain — eye velocity over target velocity, ideal around 1.0; tracking accuracy — 100 minus mean position error; saccade rate — velocity-spike bursts per second; latency — phase shift between target and gaze in milliseconds."

### Memory games

Switch to **Memory**.

> "Three games: sequence recall, pattern ladder, target scan. Voice prompts toggle is right there next to the games — patient-controlled, not buried in operator settings."

Play a quick round of sequence recall.

### People + Profile + Memories

Briefly tap through:

> "People — quick-call list with photos. Memories — captioned photos curated by the caregiver. Profile — name, blood type, allergies, medical notes, emergency CTA. All editable from the caregiver's Manage scene."

## Switching to caregiver (~30 sec)

Click **Parameters** (bottom-right) → switch to **Caregiver**.

> "Same data, operations layout. The sidebar items map to focused scenes — Overview, Map, Alerts, Gait, Vision, Cognition, Manage."

## Caregiver flow (~2 min)

### Overview

> "Patient header card with photo, name, medical notes. Sensor status grid below. Four quick metrics — location, gait, vision, cognition — each clickable to jump to its detail scene."

### Map / wandering

Click **Map** in the sidebar.

> "Drag the marker to relocate the safe zone. The radius slider has a 44-pixel touch target. Three detectors run continuously: out-of-bounds excursions, dwelling — 'stuck in a 10-meter box outside the safe zone for 15+ minutes' — and pacing — back-and-forth motion in a confined corridor."

Open **Parameters** → enable simulations → set route to **Prolonged dwelling**.

> "I just told the location stream to simulate the patient sitting outside the safe zone. After 15 simulated minutes, the alerts engine fires a 'dwelling / lost anomaly' warning."

### Alerts

Click the bell or sidebar → **Alerts**.

> "Persistent feed. Severity-coded. Dedupe is automatic — the same condition won't re-fire on every render."

### Gait analysis

Sidebar → **Gait**.

> "Live waveform. Cyan is vertical acceleration; orange is total magnitude. The classifier looks for two patterns: shuffling — reduced vertical, more lateral noise — and falls — a single high-magnitude spike followed by 0.85 seconds of motionlessness."

In Parameters, switch **Gait profile** to **Fall event**.

> "Fall simulated. Risk score climbs to 98%, label flips to 'Fall detected', danger alert fires."

### Ocular biomarkers (unified view)

Sidebar → **Vision**.

> "Two pipelines in one place. Top section is the live Eye Check — same mesh overlay the patient sees, plus the biomarker StatusBoard. Bottom section is the Pursuit Test history — latest gain / accuracy / saccade rate / latency tiles, plus a recent-sessions list."

If the patient ran a pursuit test earlier, the metrics are here.

### Cognitive trends

Sidebar → **Cognition**.

> "Memory span and reaction time across stored sessions. Cyan up = good. Orange down = good. Decline alerts compare new sessions against the rolling baseline."

### Manage

Sidebar → **Manage**.

> "Caregiver-side editor. Profile (with photo upload), contacts (mark emergency), daily reminders (with notes), and photo memories (with captions). Everything saves locally and surfaces immediately in the patient view."

Add a new contact or upload a profile photo to demonstrate the round trip.

## Closing (~30 sec)

> "Stack: React 19, MediaPipe Tasks Vision (which replaced TF.js — 92% bundle reduction), Tailwind v4 with Radix primitives for real keyboard accessibility, full PWA with offline service-worker caching of the model. Everything runs client-side. No PII leaves the browser. Persistence is localStorage."

> "Limitations: this is hackathon-grade. Risk classifications are heuristic, not clinical. The fall detector is a 6.5g spike + stillness signature, not IMU sensor fusion. Pursuit metrics are calibrated to literature ranges but not validated against patients."

## Backup plays if a sensor fails

| Sensor | If it fails | What to say / do |
|---|---|---|
| Camera | Permission denied or no webcam | Open Parameters → enable simulations. Eye Check shows the CTA card; Pursuit Test refuses to score (correct behavior). Demo the sim-driven anomalies instead. |
| GPS | No HTTPS or denied | Same — enable simulations + select **Prolonged dwelling** to drive the alert. |
| Motion | iOS denial, no DeviceMotion | Same — enable simulations + select **Fall event**. |

## Punchlines worth memorizing

- "Simulations are off by default. The app shows real empty states until permissions are granted, so judges can see what works without sensors."
- "Vision chunk is 136 KB, down from 1.6 MB on the original prototype."
- "MediaPipe inference happens entirely on-device. Video never leaves the browser."
- "Camera survives navigation — video element lives at the patient view root."
- "Sliding 60-second blink rate window with first-15s extrapolation."
- "Fixation is iris-position variance, not eyelid state — natural blinking doesn't crash it."
- "Pursuit gain is mean(|eye velocity|) / mean(|target velocity|) — standard oculomotor metric."
- "All persistence is localStorage. No backend, no audit trail. Demo only."

## Things you should NOT claim

- Don't say "clinically validated" or "FDA-cleared" — neither is true.
- Don't say "diagnoses Alzheimer's" — it screens for risk signals.
- Don't say the games are "trained on a clinical dataset" — they're not.
