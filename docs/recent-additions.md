# Recent additions

Curated changelog of late-stage features shipped after the initial
full-stack migration. Each entry is a single capability with the
specific commit + the affected surfaces, so a returning reader can
look up what changed without crawling `git log`.

---

## Backend / data

### Fernet column encryption of PII at rest
Alembic `0007` encrypts five `profiles` columns (`full_name`,
`preferred_name`, `allergies`, `medical_notes`, `home_address`) and
two `contacts` columns (`name`, `phone`) using Fernet-encrypted BYTEA
via a SQLAlchemy `TypeDecorator` in `backend/app/security_pii.py`.

- Transparent at the ORM layer — `Mapped[str]` columns stay strings
  to Python; encrypt/decrypt is invisible to the routes.
- `FERNET_KEY` env var required at startup; the type's lazy init
  raises `FernetKeyMissing` if a read/write hits it without a key set.
- Threat model: defends against accidental DB dumps / snapshot leaks.
  Not E2EE — the server has the key to render screens.
- Symmetric downgrade decrypts back to plaintext; the migration is
  reversible but the key is treated as permanent (rotating would
  orphan every encrypted row).

### Delete-account flow
`DELETE /api/v1/auth/me` requires `current_password` +
`username_confirmation` (typed username). Cascades through every
domain table via the existing `ON DELETE CASCADE` FKs:

- profile, contacts, reminders, memories, game_sessions,
  pursuit_results, alerts, geofence_zones+settings, screening_results,
  sessions, pairings (both `caregiver_id` and `patient_id` sides
  cascade).
- **Policy**: caregiver-delete cascades the pairing row but leaves the
  patient account alive (unpaired). Symmetric for patient-delete.

Frontend exposes a "Danger zone" block at the bottom of
`AccountSettingsCard` with a two-step confirm.

### Caregiver-controlled patient profile lock
`profiles.caregiver_locked` (Alembic `0006`). When set:

- Patient ProfileScene replaces the Edit Details button with a Locked
  badge and shows an amber banner explaining how to ask for unlock.
- Backend rejects PUT `/api/v1/patients/<id>/profile` from the patient
  role with 403 if the row is locked.
- Patient cannot toggle the flag themselves (server strips
  `caregiver_locked` from any payload submitted by the patient role).

Caregiver Manage scene has the toggle as an immediate action.

### Multi-device handoff for the patient live channel
`backend/app/ws_hub.py` gained a `patient_writers: dict[uuid, WS]`
registry. When a new patient-role WebSocket connects, it atomically
replaces the previous primary in that registry; the displaced WS gets
a `{"type":"displaced"}` message + close code 4001 (WebSocket private-
use range).

Frontend (`useLiveStream.tsx`) tracks a `displaced` flag and exposes a
`reclaim()` action that re-establishes the WS. Patient view mounts a
sticky amber `DisplacedDeviceBanner` with a "Use this device" button
that calls `reclaim()` (which in turn displaces whoever's primary).

Caregivers are not subject to the registry — multiple caregiver tabs
subscribing to the same patient topic is the desired behaviour.

### DB keep-alive ping
`backend/app/main.py` lifespan spawns an asyncio task that runs
`SELECT 1` every 4 minutes so Aiven's free-tier Postgres doesn't
suspend between HF Space's 48-h sleep window. Cancelled cleanly on
shutdown.

### Account settings: change password / username / display name
`POST /api/v1/auth/change-password`, `PATCH /api/v1/auth/me`. Change-
password rotates every existing session for the user, then issues a
fresh one back to the caller so other devices are kicked out but the
current session stays alive. Username changes check uniqueness
against the index; collision returns 409.

---

## ML models

### Three tabular models optimised
- `alzheimer_tabular`: LightGBM (num_leaves=15, lr=0.05). CV
  accuracy 95.1 %, AUC 0.96.
- `dementia_oasis`: **CatBoost** (depth=3, lr=0.088, l2=5.3) after a
  3-algo Optuna sweep with engineered features (ASF×eTIV,
  per-subject visit deltas of MMSE/nWBV/eTIV, MMSE×Age, SES×EDUC) and
  3-seed × 5-fold GroupKFold-by-subject averaging. Honest CV AUC
  0.88 (random-split) / 0.86 (subject-grouped).
- `adresso_agitation`: **CatBoost** with SqrtBalanced class weights
  + 160 features (lag1, 3-day rolling, 7-day baseline-delta) +
  Optuna sweep. GroupKFold-by-patient AUC 0.89; 4 % prevalence so
  accuracy is meaningless.

All three ship as `joblib` bundles in `backend/app/ml/artifacts/`.
`requirements.txt` includes `lightgbm`, `xgboost`, `catboost`.

### MRI dataset audit + re-training
[`alzheimer_mri_audit.md`](./alzheimer_mri_audit.md). We found the
originally-given dataset is a 7–156× transformation expansion of just
6 400 unique slices. The unaugmented source ships in
`datasets/alzheimer_mri/original_dataset/` (and in
`bundle/cogni_mri_bakeoff/` for remote GPU runs).

The current MRI training script (`bundle/cogni_mri_bakeoff/train_alzheimer_mri_v2.py`):
- Bakes off 8 timm backbones (MobileNetV3 S/L, ResNet18/50,
  EfficientNet B0/B2, ConvNeXt-Tiny, EfficientNetV2-S) in parallel
  across multiple GPUs (one subprocess per GPU pinned via
  `CUDA_VISIBLE_DEVICES`).
- Per-architecture LR overrides (ConvNeXt diverges at 3e-4).
- Per-architecture image-size overrides (EfficientNet-B2 → 260,
  EfficientNetV2-S → 288).
- WeightedRandomSampler + class-weighted CE for the 50× imbalance.
- Stronger augmentation (rotation, affine, RandomResizedCrop,
  RandomErasing).
- Horizontal-flip TTA at validation.
- Picks the winner by macro-F1; exports to ONNX (opset 18) so the
  FastAPI backend keeps using `onnxruntime` for inference.

### Plain-language screening UI
Every screening tab in the caregiver view now has:

- A **"How well does it work?" popover** showing accuracy / precision
  / recall / F1 / AUC / average precision with a one-line plain-
  English explainer per metric. Numbers come from
  `datasets/scripts/eval_screening_metrics.py` which re-fits each
  shipped model in CV and writes the honest numbers back into
  `<key>.meta.json`.
- A **TopFeatures** block under the result card showing the model's
  top-5 most important inputs (`feature_importances_` normalised to
  100 %). Populated by `datasets/scripts/dump_feature_importances.py`
  into the same meta.
- A **screening history** list at the bottom of each tab pulling
  `GET /api/v1/patients/{id}/screening?model=<key>`. Past runs
  collapse open to show the original `inputs_json`.

---

## Frontend feature surfaces

### Decline slope alerts on TrendsScene
Least-squares regression across the last 8 finalized game sessions.
A slope beyond 1/3 of the window's standard deviation is flagged
"declining" (for memory span: going down; for reaction time: going
up); within that band is "stable". Heuristic, not clinical.

### Adaptive difficulty for sequence recall
The game persists the last successful span to `localStorage` and
resumes there on the next session (clamped to 3–12). Patients no
longer restart at span 3 every time.

### Alerts grouping + critical-only filter
`AlertsPanel` groups by module (Gait, Vision, Location, Cognition)
with a count per group; module order is most-severe-alert first. New
"All / Critical only" pill in the header filters to danger+warning.

### Geofence circle mode
`GeofencePanel` gains an "Add circle" button next to the existing
polygon draw. Tap to place centre, drag a radius slider; commit
converts the circle to a 32-vertex polygon so the existing
`pointInPolygon` code path is unchanged.

### Gyroscope axis on the gait waveform
`MotionSample` gains `rotX/rotY/rotZ` + `rotMagnitude` from
`DeviceMotionEvent.rotationRate` (deg/s). `GaitPanel` shows two
stacked grids (linear acceleration + rotation rate). Auto-hides the
rotation grid when every sample reads ~0 (laptops with no gyro).

### Custom reminder time picker
Replaces the OS-default `<input type="time">` with two `<select>`s
(hour + minute) + an AM/PM toggle. Preset chips (Morning, Noon, etc.)
on the same card.

### Stale-chunk recovery (Vercel redeploy)
`src/lib/chunk-recovery.ts`:

- `lazyWithRetry()` wraps every `React.lazy()` call. On first dynamic-
  import failure, nuke the service worker + Cache Storage and hard-
  reload with a cache-buster query param.
- ErrorBoundary's `componentDidCatch` also pipes stale-chunk errors
  through the same recovery path (Suspense swallows the global
  error event).

### Map z-index isolation
Map containers in `patient/MapScene` + `GeofencePanel` get `isolate`
so Leaflet's 700–1000 z-index range can't escape into the page
stacking context and bleed over the mobile BottomNav (z-[1050]).

### Accessibility-tuned font scale
Tailwind v4 `--text-*` tokens overridden in `src/index.css`: xs is
13 px (was 12), sm 15 px (was 14), base 17 px (was 16). 90+
occurrences of `text-[10px]` / `text-[11px]` bulk-replaced with
`text-xs` so the floor is 13 px across the whole UI.

### Self-test for caregiver vision
Caregiver Vision → Self test renders the same camera-first patient
EyeScene component, reframed as a fallback for when the patient's
device isn't available. Vision-pipeline props plumbed through
App → CaregiverView → VisionScene → EyeScene.

---

## Pending follow-ups

See [`CLAUDE.md` "Known follow-ups"](../CLAUDE.md) (gitignored —
internal planning) for the full list. Highlights:

- Consent + PDPA notice at signup (`terms_accepted_at` column,
  `/privacy` static page).
- Out-of-band alert delivery (Twilio SMS or FCM web push).
- OneMap tile swap for the Singapore-context judging.
- Home-base picker (today the safe-zone centre is a hardcoded
  Singapore default in `constants/app.ts`).
- Redis Pub/Sub for cross-replica WS fanout (only needed at scale).
- Patient-level GroupKFold for the MRI model — requires going back
  to OASIS-1 upstream of Kaggle since neither the augmented nor the
  original Kaggle filenames encode patient IDs.
