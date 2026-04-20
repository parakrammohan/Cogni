# CogniTrack

CogniTrack is a browser-based Alzheimer’s detection and care demo built with React, TypeScript, Vite, Tailwind CSS, and Lucide icons. It has two operating surfaces:

- Patient view: guided checks, calmer UX, cognitive game, and sensor controls.
- Caregiver view: anomaly feed, gait/vision summaries, spatial telemetry, and session trends.

## What It Does

- Requests real browser APIs when available:
  - `navigator.geolocation.watchPosition`
  - `DeviceMotionEvent`
  - `navigator.mediaDevices.getUserMedia`
  - TensorFlow.js face-landmarks detection
  - `window.speechSynthesis`
  - `localStorage`
- Falls back to deterministic simulations when permissions or hardware are unavailable.
- Implements explicit anomaly logic for:
  - Geofencing and wandering detection
  - Pacing detection using projected corridor crossings
  - Dwelling detection using a rolling bounding box
  - Gait variance analysis and fall signature detection
  - A playable 3x3 sequence-memory task with reaction-time tracking

## Live Vs Simulated

### Real Browser Features

- GPS tracking can run from live browser geolocation.
- Motion tracking can run from live `devicemotion` samples.
- Camera access is real when the browser allows it.
- Face landmarks are real when the TensorFlow runtime loads successfully.
- The safe zone can be moved on the Leaflet map and resized with the in-app radius control.
- Game sessions and history persistence are real.

### Simulated / Demo Behavior

- Location path simulation is used for demo wandering, pacing, and dwelling scenarios.
- Motion simulation is used when motion access is blocked or unavailable.
- Vision simulation drives the moving-target overlay when camera/model access is blocked or when the camera is live but no face lock is present yet.
- Caregiver alerts are UI-only. There is no Twilio, push, or backend delivery.
- Risk labels are heuristic demo logic, not clinically validated scoring.

## Tech Stack

- React 18
- TypeScript / TSX
- Vite
- Tailwind CSS v4
- Leaflet + React Leaflet
- Lucide React
- TensorFlow.js face-landmarks detection

## Project Structure

```text
src/
  components/
    panels/
    ui/
  constants/
  hooks/
  lib/
  types/
  views/
  App.tsx
  main.tsx
```

## Local Development

### Install

```bash
npm install
```

### Start Dev Server

```bash
npm run dev
```

### Type Check

```bash
npm run check
```

### Production Build

```bash
npm run build
```

## Notes On Vision Runtime

The TensorFlow vision stack is lazy-loaded into a separate chunk so it does not bloat the initial app bundle. The runtime is only pulled in when the vision pipeline is prewarmed or the camera flow is activated.

The UI now exposes three explicit vision states:

- `Simulation`: no live camera-driven landmarks are being used.
- `Camera search`: the camera is active, but a face has not been locked or inference has fallen back.
- `Live face mesh`: real eye and iris landmarks are currently driving the overlay.

## Limitations

- The map now uses real OpenStreetMap tiles through Leaflet, but it is still frontend-only and not backed by routing/geocoding/search services.
- The app is frontend-only.
- No real caregiver messaging or backend audit trail exists yet.
- Medical and cognitive scoring is demo-grade and should not be treated as diagnosis.

## Map Notes

- Leaflet itself does not require an account.
- Standard OpenStreetMap tile usage for a normal demo website does not require an account either.
- You still need visible attribution and you should not assume the public OSM tile server is a heavy-production free backend.
