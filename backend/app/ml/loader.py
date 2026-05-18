"""Lazy artifact loader.

Tabular models ship as joblib-serialised sklearn-compatible estimators
(LightGBM/XGBoost). The MRI model still ships as ONNX. Both are loaded
on first use and cached per model name.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

log = logging.getLogger("cogni.ml")

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"

ModelName = str  # one of: alzheimer_tabular, dementia_oasis, adresso_agitation, alzheimer_mri


@lru_cache(maxsize=8)
def load_meta(model: ModelName) -> dict[str, Any]:
    path = ARTIFACTS_DIR / f"{model}.meta.json"
    if not path.exists():
        raise FileNotFoundError(f"meta for {model!r} not found at {path}")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=8)
def load_estimator(model: ModelName) -> dict[str, Any]:
    """Returns the joblib bundle {"model": estimator, "features": [...], ...}
    for a tabular model. Estimators expose predict_proba()."""
    import joblib  # type: ignore[import-untyped]

    path = ARTIFACTS_DIR / f"{model}.joblib"
    if not path.exists():
        raise FileNotFoundError(f"joblib artifact for {model!r} not found at {path}")
    log.info("Loading joblib estimator for %s from %s", model, path)
    bundle = joblib.load(path)
    if not isinstance(bundle, dict) or "model" not in bundle:
        raise ValueError(f"joblib bundle for {model!r} missing 'model' key")
    return bundle


@lru_cache(maxsize=8)
def load_session(model: ModelName):
    """ONNX session (used for the MRI image classifier only)."""
    import onnxruntime as ort  # type: ignore[import-not-found]

    path = ARTIFACTS_DIR / f"{model}.onnx"
    if not path.exists():
        raise FileNotFoundError(f"ONNX artifact for {model!r} not found at {path}")
    log.info("Loading ONNX session for %s from %s", model, path)
    sess = ort.InferenceSession(
        str(path),
        providers=["CPUExecutionProvider"],
    )
    return sess
