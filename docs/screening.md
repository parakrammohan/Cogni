# Screening — ML risk models

Cogni ships four trained models that estimate Alzheimer's / dementia /
agitation risk from different inputs. They live in the caregiver's
**Screening** tab and run **server-side**. The three tabular models
load via `joblib.load` (sklearn-compatible estimators —
LightGBM / XGBoost / CatBoost). The MRI image classifier is the only
one still on `onnxruntime` since it'll be a CNN.

## Models

| Model key | Algorithm | Honest CV (re-fit per fold, no peeking) | Input |
|---|---|---|---|
| `alzheimer_tabular` | **LightGBM** (num_leaves=15, lr=0.05) | acc 0.9553, precision 0.9487, recall 0.9237, F1 0.94, AUC 0.95 | 32-field clinical questionnaire |
| `dementia_oasis` | **CatBoost** (depth=3, lr=0.088, l2=5.3) | acc 0.721, F1 0.71, AUC 0.78 (5-fold GroupKFold-by-subject) | OASIS-2 + engineered (17 total features incl. ASF×eTIV, MMSE×Age, per-subject visit deltas) |
| `adresso_agitation` | **CatBoost** (depth=4, lr=0.056, SqrtBalanced class weights) | acc 0.94, F1 0.04 at threshold 0.5, AUC 0.80 (5-fold GroupKFold-by-patient, 4 % prevalence) | TIHM 1.5 + engineered (160 features incl. lag1, 3-day rolling, 7-day baseline-delta vs each patient's own median) |
| `alzheimer_mri` | timm CNN (in-progress bake-off across 8 backbones — current winner is EfficientNet-B2 at macroF1 0.73) | re-trained on the unaugmented 6 400-image source — see [`alzheimer_mri_audit.md`](./alzheimer_mri_audit.md) | RGB MRI slice, resized to model's native input (224 / 260 / 288 depending on backbone) |

The first three numbers come from `datasets/scripts/eval_screening_metrics.py`, which re-fits each shipped model in CV (StratifiedKFold for `alzheimer_tabular`, GroupKFold-by-subject for `dementia_oasis`, GroupKFold-by-patient for `adresso_agitation`) and writes the result into each `<key>.meta.json` under `metrics.cv_*`.

Each artifact is a pair: `<key>.joblib` (the model, framework specified in the bundle) or `<key>.onnx` (MRI), plus `<key>.meta.json` (feature list, imputation defaults, classes, metrics, feature_importances, caveats). Mirrors live in `public/models/` so the frontend can render the input forms without an extra round-trip.

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

**Loading.** `app/ml/loader.py` exposes two lazy-cached loaders:

- `load_estimator(key)` — `joblib.load` for the 3 tabular models. Returns a `{"model": estimator, "features": [...], "framework": "..."}` bundle.
- `load_session(key)` — `onnxruntime.InferenceSession` for the MRI model only.

Both are `@lru_cache`d so subsequent inferences are zero-cost. The expensive imports (`joblib`, `onnxruntime`, `lightgbm`/`xgboost`/`catboost`) happen inside the loader so non-ML routes don't pay the cold-start.

**Input shaping (tabular).** The frontend posts a `{ features: {...} }` dict. `tabular._build_vector(model, features)` walks the meta's `features` list in order, fills missing keys from `imputation_values` (or `missing_value_fill` for adresso's lag/rolling features), and returns a `(1, feature_count) float64` array. The estimator's `predict_proba` is called directly; we take `arr[0, -1]` as the positive-class probability for binary models.

**MRI.** Uploaded as `multipart/form-data` with field `image`. `app/ml/mri.py` switches preprocessing based on the meta's `input_shape`:
- Legacy `[H, W]` (the original sklearn MLP): grayscale → divide by 255 → flatten.
- Current `[H, W, 3]` (CNN backbones): convert RGB → resize → divide by 255 → subtract ImageNet mean → divide by ImageNet std → transpose to NCHW.

CNN ONNX exports emit raw logits, so the code detects this (row sum != 1 or negatives present) and applies a softmax before band-mapping.

**Persistence.** Every inference run inserts a row into `screening_results` (model, inputs_json, probability, band, classes_json). The screening UI pulls recent runs via `GET /api/v1/patients/{id}/screening?model=…&limit=…` and renders them as a collapsible past-runs list under each tab.

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

Each tab also surfaces:

- **`<MetricsPopover>`** — "How well does it work?" button that opens
  a small popover with accuracy / precision / recall / F1 / AUC /
  average precision and a one-line plain-English explainer per
  metric. Reads `meta.metrics.cv_*` (populated by
  `datasets/scripts/eval_screening_metrics.py`).
- **`TopFeatures`** block under the result card — shows the top 5
  contributors to the model overall, as a labelled bar chart. Reads
  `meta.feature_importances` (populated by
  `datasets/scripts/dump_feature_importances.py`, which extracts
  `feature_importances_` / `get_feature_importance()` and normalises
  to 100 %).
- **`<ScreeningHistoryList>`** — collapsible list of past runs for
  this patient + model. Each row is `prob % + band + relative time`;
  click to expand the stored `inputs_json`.

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

## Caveats (carried into the popover the caregiver sees)

- **alzheimer_mri**: the originally-given dataset is a 7-156×
  augmentation of just 6 400 unique slices. We retrained on the
  unaugmented source, but neither the augmented nor the original
  Kaggle filenames encode patient IDs, so even our honest CV is
  image-level not patient-level. True patient-grouped CV would
  require going back to OASIS-1 upstream. Full write-up:
  [`alzheimer_mri_audit.md`](./alzheimer_mri_audit.md).
- **adresso_agitation**: extreme class imbalance (4% positives).
  GroupKFold-by-patient AUC ≈ 0.80 — good ordering, not great
  separation. Precision/recall at threshold 0.5 are intentionally
  low — the model is cautious about a rare positive.
- **dementia_oasis**: 373 rows × 150 subjects is small for modern
  ML standards. Subject-grouped CV AUC ~0.78 is the honest number;
  random-split CV inflates it to ~0.89 because of multi-visit
  leakage. We report the honest one.
- All four are educational tools, not approved medical devices.
