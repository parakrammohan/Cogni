"""Tabular ONNX inference — one helper per model since the feature
sets differ. Each returns a dict that pydantic schemas can serialize."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.ml.loader import load_meta, load_session


def _build_vector(model: str, features: dict[str, Any]) -> np.ndarray:
    """Convert {feature_name: value} → ordered float32 vector based
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
    return np.asarray([row], dtype=np.float32)


def _band(prob: float) -> str:
    if prob >= 0.66:
        return "high"
    if prob >= 0.33:
        return "moderate"
    return "low"


def _extract_positive_probability(outputs: list[np.ndarray], classes: list[str]) -> float:
    """sklearn → ONNX exports usually have outputs = [label, probability_map].
    For binary classifiers we want P(class[-1]) (i.e. the 'positive' class,
    typically index 1).
    """
    if not outputs:
        return 0.0
    # Find the probability tensor: a 2D float array with 2 columns for binary.
    for arr in outputs:
        if isinstance(arr, np.ndarray) and arr.ndim == 2 and arr.shape[-1] == len(classes):
            return float(arr[0, -1])
        # ONNX zipmap-style: sometimes list of dicts.
        if isinstance(arr, list) and arr and isinstance(arr[0], dict):
            d = arr[0]
            keys = list(d.keys())
            return float(d[keys[-1]])
    # Single value with shape (1,) — treat as raw probability.
    flat = np.asarray(outputs[-1]).reshape(-1).astype(float)
    if flat.size:
        return float(flat[-1])
    return 0.0


def predict(model: str, features: dict[str, Any]) -> dict[str, Any]:
    meta = load_meta(model)
    classes: list[str] = meta["classes"]
    vec = _build_vector(model, features)
    sess = load_session(model)
    input_name = sess.get_inputs()[0].name
    outputs = sess.run(None, {input_name: vec})
    probability = max(0.0, min(1.0, _extract_positive_probability(outputs, classes)))
    return {
        "probability": probability,
        "band": _band(probability),
        "classes": classes,
    }
