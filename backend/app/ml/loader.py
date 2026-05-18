"""Lazy ONNX session loader.

Sessions are created on first use, cached per model name. ONNX runtime
itself is loaded only when this module is first imported — keeping
startup time low.
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
def load_session(model: ModelName):
    """Returns an `onnxruntime.InferenceSession`. Lazy-imports onnxruntime
    so the test suite (and any non-ML routes) don't pay the load cost."""
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
