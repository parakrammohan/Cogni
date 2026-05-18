# WebSocket — live patient state

The caregiver dashboard needs to know whether the patient's app is
actually running and what the latest sensor readings look like. We
publish a 1 Hz snapshot from the patient's device over a single
WebSocket and fan it out to the paired caregiver(s).

## Endpoint

```
wss://cogni-team-cogni.hf.space/api/v1/ws
```

Auth is the same `cogni_session` HttpOnly cookie the REST endpoints
use. Browsers send it on the WS upgrade automatically because the
cookie is `SameSite=None; Secure`, so there's no `?token=` query
parameter hack to worry about.

On connect the server:

1. Looks up the session by `sha256(cookie_value)`.
2. Resolves the user → their role.
3. Subscribes the socket to the right topic(s):
   - Patient → `patient:<own_id>`
   - Caregiver → every paired patient's `patient:<id>`
4. Sends a `hello` frame so the client knows it's live.

```json
{ "type": "hello", "role": "caregiver", "user_id": "...", "subscribed": ["patient:..."] }
```

## Message protocol

Patients publish, caregivers receive. Anything from a caregiver is
silently dropped.

Patient → server:
```json
{
  "type": "patient_state",
  "data": {
    "vision": { "ear": 0.27, "blinkRate": 14, "fixation": 86, "faceDetected": true, "risk": "Low" },
    "gait":   { "label": "Normal", "riskScore": 0.12 },
    "location": { "lat": 1.3521, "lng": 103.8198 },
    "outOfBounds": false,
    "wandering": false
  },
  "ts": "2026-05-18T07:42:00.000Z"
}
```

Server tags it with the authoritative `patient_id` and republishes on
`patient:<id>`. Caregivers subscribed to that topic receive:

```json
{
  "type": "patient_state",
  "patient_id": "uuid…",
  "data": { … },
  "ts": "…"
}
```

## Rate

- **Patient → server**: throttled client-side to **1 Hz** in
  `useLiveStreamSender`. Server doesn't currently enforce a hard rate
  limit; the docs/CLAUDE.md plan is to add a 5 Hz cap.
- **Server → caregiver**: same rate (fan-out, no aggregation).

Why 1 Hz: anything faster blows bandwidth on the HF free tier without
adding clinical value. Vision/gait analysis themselves run at higher
internal frequencies; the WS aggregates the latest visible value.

## Server fan-out — `app/ws_hub.py`

```python
class WsHub:
    def __init__(self):
        self._subs: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
    async def subscribe(topic, ws): ...
    async def unsubscribe(topic, ws): ...
    async def unsubscribe_all(ws): ...
    async def publish(topic, payload) -> int: ...
```

In-process pub/sub. Each topic maps to a set of connected `WebSocket`
instances. `publish()` serializes the payload once and sends to every
subscriber concurrently; failures cause the socket to be pruned.

### Single-process limitation

There's only one HF Space replica, so cross-replica fan-out doesn't
apply. Scaling beyond one process needs Redis Pub/Sub (or similar)
because the in-memory map doesn't share. Documented as a known
limitation in CLAUDE.md.

## CORS / CSRF on the WS upgrade

WebSocket upgrades arrive as GET requests, which the
`OriginCsrfMiddleware` allows by default (only POST/PATCH/DELETE/PUT
are checked). Cross-origin connection from
`https://cogni-steel.vercel.app` to `https://cogni-team-cogni.hf.space`
works because the SameSite=None cookie travels.

## Client side — `src/ws/useLiveStream.tsx`

Three exports:

- `<LiveStreamProvider>` — mounted once below `<AuthGate>`; owns the
  single WebSocket per session. Exponential backoff reconnect (1s → 30s
  cap, with jitter). Tears down when the user signs out.
- `useLiveConnectionStatus()` — `"idle" | "connecting" | "open" | "closed" | "error"`.
- `useLiveStream(patientId)` — caregiver-side. Returns the most recent
  `patient_state` message for that patient (or `null`).
- `useLiveStreamSender(getSnapshot, enabled)` — patient-side. Throttles
  to 1 Hz and pushes the result of `getSnapshot()` (or nothing if it
  returns null). Skipped entirely when `enabled === false` (e.g. the
  signed-in user is a caregiver).

The patient sender lives at the App level (`src/App.tsx`) where all the
sensor state is in scope.

## Where caregivers see the live data

- **Overview scene** — a "Patient online / offline" pill in the header.
  Online = WS status is `open` AND a `patient_state` arrived within the
  last 10 seconds. Shows "last N seconds ago".
- Other caregiver scenes (Vision, Gait, Map) currently read from
  React state pushed from the *caregiver's own* sensors, not from the
  WS feed. Wiring those scenes to the WS feed is a documented follow-up.

## Failure modes

| Condition | Behaviour |
|---|---|
| Cookie missing on upgrade | Server closes with code 1008. Client retries on the next backoff tick (succeeds after sign-in). |
| Session expired | Same as above — re-login. |
| Server restart | All sockets close with 1011. Client reconnects within ~1 s. |
| Patient closes their tab | Server detects disconnect, unsubscribes from all topics. Caregiver Overview shows "offline" after 10 s. |
| Caregiver loses internet | Reconnect with backoff up to 30 s. Caregiver Overview shows "offline" but reconnects automatically. |
