# Screening — ML risk models

Cogni ships four trained models that estimate Alzheimer's / dementia /
agitation risk from different inputs. They live in the caregiver's
**Screening** tab and run **server-side** via `onnxruntime` (Python).
The `*.onnx` weights ship inside the backend Docker image, not the
SPA bundle.

## Models

| Model key | Type | Features | Output |
|---|---|---|---|
| `alzheimer_tabular` | sklearn GBM | 32-field clinical questionnaire | P(Alzheimer's) |
| `dementia_oasis` | sklearn GBM | OASIS-2 (10 features: visit, age, MMSE, eTIV, nWBV, ASF, etc.) | P(Demented or Converted) |
| `adresso_agitation` | sklearn GBM (class-balanced) | 41-feature daily activity profile | P(agitation event today) |
| `alzheimer_mri` | sklearn StandardScaler→PCA(128)→MLPClassifier | 64×64 grayscale MRI slice | 4-class softmax (NonDemented / VeryMildDemented / MildDemented / ModerateDemented) |

Each artifact is a pair: `<key>.onnx` (the model) + `<key>.meta.json`
(feature list, imputation defaults, classes, metrics). The `.onnx`
files are bundled inside the Docker image at
`backend/app/ml/artifacts/`. The `.meta.json` files also live in
`public/models/` so the frontend can render the input forms without an
extra round-trip.

## Backend pipeline

```
src/views/caregiver/ScreeningScene  →  /api/v1/patients/{id}/screening/{model}
                                         ↓
                                    app/api/v1/screening.py
                                         ↓
                                    app/ml/tabular.predict        (or mri.predict_from_image)
                                         ↓
                                    lru_cached InferenceSession
                                         ↓
                                    persist row to `screening_results`
                                         ↓
                                    return ScreeningRunOut
```

**Loading.** `app/ml/loader.py` lazily creates one
`onnxruntime.InferenceSession` per model on first request, then caches
it with `@lru_cache` so subsequent inferences are zero-cost. ONNX
Runtime itself is imported inside the loader, so non-ML routes don't
pay the cold-start.

**Input shaping (tabular).** The frontend posts a `{ features: {...} }`
dict. `tabular._build_vector(model, features)` walks the meta's
`features` list in order, fills missing keys from `imputation_values`,
and returns a `(1, feature_count) float32` array. The output's
positive-class probability is extracted with some tolerance for ONNX
exporter quirks (some sklearn → ONNX converters emit a list of dicts;
others emit a 2D tensor).

**MRI.** Uploaded as `multipart/form-data` with field `image`. The
server decodes via Pillow → grayscale → resize to 64×64 → divide by
255 → flatten to `(1, 4096)`. Then the same `InferenceSession.run()`.
Output is full 4-class softmax + a derived "any dementia" probability
for the band classifier.

**Persistence.** Every inference run inserts a row into
`screening_results` (model, inputs_json, probability, band,
classes_json). Caregivers can pull recent runs via
`GET /api/v1/patients/{id}/screening?model=…&limit=…` — that powers
the (planned) history view inside ScreeningScene.

## Endpoints

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/v1/patients/{patient_id}/screening/{alzheimer_tabular\|dementia_oasis\|adresso_agitation}` | `{ "features": {...} }` |
| `POST` | `/api/v1/patients/{patient_id}/screening/alzheimer-mri` | `multipart/form-data` with `image=<file>` |
| `GET` | `/api/v1/patients/{patient_id}/screening?model=&limit=` | — |

All require a pairing-authorized session — i.e. you're either that
patient or the paired caregiver.

## Frontend

`src/features/screening/inference.ts`:

```ts
runBinary(modelKey, features, patientId) → BinaryResult
runMulticlass("alzheimer_mri", imageBlob, patientId) → MulticlassResult
loadModelMeta(modelKey) → ModelMeta   // for form-rendering only
```

`BinaryFormCard` + `MriUploadCard` (under
`src/components/screening/`) handle the per-model UI. The form schema
itself (label, type, min/max, default) lives in
`src/features/screening/schemas/<model>.ts`.

## Risk bands

The probability is bucketed into a `low | moderate | high` band by a
common cutoff (`< 0.33 → low`, `< 0.66 → moderate`, else `high`). This
is purely for display — the raw probability is also returned so the
caller can apply a clinical cutoff.

## Why backend, not browser

The original prototype ran ONNX in the browser via `onnxruntime-web`.
Moving to backend inference:

- **−360 KiB** off the frontend bundle (no more `onnx-runtime` chunk).
- **−2.6 MiB** of `.onnx` files removed from PWA precache.
- Inference now persists into `screening_results`, so the caregiver
  dashboard can show history across devices.
- We can iterate on the models without forcing every client to
  redownload them.
- The MRI workflow can do server-side image processing (resize,
  normalize, PCA) without paying for it on the patient's phone.

## Caveats (carried over from the meta files)

- **alzheimer_mri**: trained on the Kaggle "combined images" set which
  augments per-patient slices many times — image-level train/test
  splits leak between sets. Reported 78% accuracy overstates clinical
  performance on truly unseen patients. Treat as a demo, not a
  diagnostic claim.
- **adresso_agitation**: extreme class imbalance (4% positives).
  GroupKFold by patient_id gives AUC ~0.78 — good ordering, not great
  separation.
- All four are educational, not approved medical devices.
