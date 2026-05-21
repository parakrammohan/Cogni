# Cogni — Technical Docs

Deep-dive reference for every part of the system: the detection
pipelines on the patient device, the games and metrics, the FastAPI
backend, the Postgres schema, auth and pairing, the live WebSocket
channel + multi-device handoff, the ML screening models, PII
encryption, and the operator-only admin dashboard. Every formula,
threshold, and route is documented so a new contributor (or you, in
two months) can find their way around.

## Stack overview

- **Backend** — [`backend.md`](./backend.md): FastAPI 0.115, SQLAlchemy 2.0 async, asyncpg, Alembic, Argon2id, opaque session tokens. Deployed to Hugging Face Space (Docker SDK, port 7860); GitHub Actions auto-pushes `backend/**` on every commit (cancel-in-progress to drain queues fast).
- **Database** — [`database.md`](./database.md): Postgres on Aiven (TLS-only). Per-patient tables for profile, contacts, reminders, memories, geofence zones+settings, telemetry (game/pursuit), alerts, screening results.
- **Auth & sessions** — [`auth.md`](./auth.md): opaque server-side tokens (sha256-stored) in HttpOnly+Secure+SameSite=None cookies. Change-password rotates sessions; delete-account cascades. No JWT.
- **Pairing** — [`pairing.md`](./pairing.md): two-way invite-code flow. Rate-limited (8/min user, 15/min IP), 15-min TTL, single active code per inviter, opposite-role enforcement.
- **Live channel** — [`websocket.md`](./websocket.md): single WS per session, 1 Hz patient-state push, in-process topic pub/sub. **Single-writer-per-patient enforcement**: a second patient device displaces the first via close code 4001; the displaced UI offers a "Use this device" reclaim button.
- **Screening** — [`screening.md`](./screening.md): 4 ML models (3 tabular via joblib + 1 MRI image via ONNX). Server-side inference; results persisted to `screening_results`; UI surfaces past-runs history + global feature importances + plain-language metric popover. MRI dataset audit at [`alzheimer_mri_audit.md`](./alzheimer_mri_audit.md).
- **Security** — [`security.md`](./security.md): threat model, TLS-everywhere posture, **PII column encryption** (Fernet on 5 profile + 2 contact columns), origin-based CSRF defence, secrets handling.
- **Admin dashboard** — [`admin.md`](./admin.md): password-gated operator UI at the HF Space root. DB row counts, recent activity, live PII-masked request feed.
- **Frontend** — [`frontend.md`](./frontend.md): React 19 + Vite SPA, TanStack Query data layer, AuthGate, LiveStreamProvider, scene structure for both views, accessibility-tuned font scale.

## Patient-device detection pipelines

The patient app does live sensor work in the browser. These docs cover
each pipeline in detail:

- [`vision.md`](./vision.md) — MediaPipe Face Landmarker, 6-point Eye Aspect Ratio (EAR), blink detection with hysteresis, fixation derived from iris-position variance, the ocular risk classifier, and the smooth-pursuit analyzer (gain / accuracy / saccade rate / phase-shift latency).
- [`location.md`](./location.md) — geofencing, pacing detection (corridor projection + axis-crossing count), and dwelling detection (rolling bounding box).
- [`motion.md`](./motion.md) — gait variance analysis, fall signature classifier, and how the live waveform is rendered.
- [`cognition.md`](./cognition.md) — sequence recall, pattern ladder, and visual search games with scoring formulas; cognitive-decline alerting against the rolling baseline.
- [`care.md`](./care.md) — patient care features (profile, contacts, reminders, memories) and how the caregiver Manage scene edits them.

## Architecture & operations

- [`architecture.md`](./architecture.md) — overall project structure, data flow, persistence layers, and the boundary between live sensors and simulated fallback.
- [`recent-additions.md`](./recent-additions.md) — running changelog of features shipped late in the project (multi-device handoff, PII encryption, dataset audit, history UI, slope alerts, etc.).
- [`verification.md`](./verification.md) — hands-on checklist for proving every feature works on a real device.
- [`demo-script.md`](./demo-script.md) — minute-by-minute demo runbook for both views.

## Dataset notes

- [`alzheimer_mri_audit.md`](./alzheimer_mri_audit.md) — judge-facing write-up of why the originally-given MRI dataset inflates metrics 7-156× and how we corrected for it by switching to the unaugmented source.
- [`alzheimer_mri_audit.json`](./alzheimer_mri_audit.json) — machine-readable per-class counts + inflation ratios.

## Quick map of the code

```
backend/
├── Dockerfile
├── requirements.txt
├── alembic/                       schema migrations
└── app/
    ├── main.py                    FastAPI app + middleware + lifespan
    ├── config.py                  pydantic-settings, env + DB URL normalisation
    ├── db.py                      async engine + session factory
    ├── deps.py                    get_db, get_current_user, require_patient_access
    ├── security.py                Argon2id passwords + opaque session tokens
    ├── ws_hub.py                  in-process WebSocket pub/sub
    ├── seed.py                    idempotent demo-account + pairing seeder
    ├── admin/                     server-rendered admin dashboard
    ├── lib/                       errors, csrf, codes, rate_limit, request_log
    ├── models/                    SQLAlchemy 2.0 ORM
    ├── schemas/                   pydantic request/response models
    ├── crud/                      repository pattern, async
    ├── ml/                        ONNX inference + bundled artifacts
    └── api/v1/                    HTTP + WebSocket routes

src/
├── api/                           typed client + TanStack Query hooks per resource
├── auth/                          AuthProvider, AuthGate, AuthScreen
├── components/                    UI primitives + shared cards (PairingCard, panels, screening)
├── features/                      vision, location, motion, screening, care pipelines
├── hooks/                         sensor + state hooks (useSubjectPatient, useBackendProfile, …)
├── lib/                           utilities (chunk-recovery, charts, tone)
├── views/                         patient/* and caregiver/* scenes
├── ws/                            useLiveStream provider + hooks
├── App.tsx                        composition root
└── main.tsx                       entry, mounts providers + AuthGate
```

## Conventions

- Every sensor hook accepts `{ simulate: boolean }` so the caller decides whether synthetic streams run.
- Cross-feature types live in `src/types/app.ts`; feature-specific types live alongside the feature.
- Tailwind tokens are defined once in `src/index.css`; visual surfaces use them consistently.
- Empty states say "Enable X" rather than rendering misleading zeros.
- Patient bell shows task notifications. Caregiver bell shows clinical alerts.
- Backend routes return Pydantic schemas, never ORM objects.
- DB writes always call `await db.refresh(row)` after `flush()` so SQLAlchemy server-side defaults (`onupdate=func.now()`) are loaded inside the greenlet context.
