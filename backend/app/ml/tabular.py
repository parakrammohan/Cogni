"""Tabular inference — joblib-loaded sklearn-compatible estimators
(LightGBM/XGBoost). One helper per model since feature sets differ;
each returns a dict that pydantic schemas can serialize."""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np

from app.ml.loader import load_estimator, load_meta

# Estimators were trained with named columns but we feed positional
# ndarrays at inference (faster, no pandas dep). Silence the cosmetic
# "feature names don't match" warning — the order is guaranteed by the
# meta.features list.
warnings.filterwarnings(
    "ignore",
    message="X does not have valid feature names",
    category=UserWarning,
)


def _build_vector(model: str, features: dict[str, Any]) -> np.ndarray:
    """Convert {feature_name: value} → ordered float64 vector based
    on the model's meta. Missing keys fall back to the imputation values
    in meta (or 0 if none)."""
    meta = load_meta(model)
    expected: list[str] = meta["features"]
    imputation: dict[str, Any] = meta.get("imputation_values") or {}
    missing_fill = meta.get("missing_value_fill", 0.0)
    row: list[float] = []
    for name in expected:
        value = features.get(name)
        if value is None:
            value = imputation.get(name, missing_fill)
        try:
            row.append(float(value))
        except (TypeError, ValueError):
            row.append(float(missing_fill))
    return np.asarray([row], dtype=np.float64)


def _band(prob: float) -> str:
    if prob >= 0.66:
        return "high"
    if prob >= 0.33:
        return "moderate"
    return "low"


def predict(model: str, features: dict[str, Any]) -> dict[str, Any]:
    import logging

    log = logging.getLogger("cogni.ml.tabular")
    try:
        meta = load_meta(model)
        classes: list[str] = meta["classes"]
        bundle = load_estimator(model)
        estimator = bundle["model"]
        vec = _build_vector(model, features)
        proba = estimator.predict_proba(vec)
    except Exception as exc:
        # Surface the *real* cause to the server log so the admin
        # dashboard error feed can show it. Without this, every
        # joblib/sklearn version mismatch or bad-feature input shows
        # up as a generic 500 with no breadcrumb.
        log.exception("tabular predict failed for model=%s: %s", model, exc)
        raise

    arr = np.asarray(proba)
    # Binary classifier: take P(positive class) = last column.
    if arr.ndim == 2 and arr.shape[1] >= 2:
        probability = float(arr[0, -1])
    else:
        probability = float(np.asarray(proba).reshape(-1)[-1])
    probability = max(0.0, min(1.0, probability))
    return {
        "probability": probability,
        "band": _band(probability),
        "classes": classes,
    }
