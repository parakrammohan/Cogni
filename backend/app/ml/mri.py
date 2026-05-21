"""MRI ONNX inference.

Supports two input layouts, picked from the meta's `input_shape`:

- **Legacy (sklearn MLP)**: `[H, W]` → grayscale, divide by 255, flatten.
- **CNN (timm backbone, current)**: `[H, W, 3]` → RGB, divide by 255,
  apply ImageNet mean/std, transpose to NCHW.

Switching is driven entirely by the meta file shipped alongside the
ONNX, so model upgrades don't require touching this code path again.
"""

from __future__ import annotations

import io
from typing import Any

import numpy as np
from PIL import Image

from app.ml.loader import load_meta, load_session

MODEL = "alzheimer_mri"

_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _preprocess(image_bytes: bytes, input_shape: list[int]) -> np.ndarray:
    """Decode bytes → preprocessed ONNX-ready tensor.

    `input_shape` is the meta's declared shape. `[H, W]` (length 2) =
    legacy grayscale flat path; `[H, W, C]` with C==3 = CNN path.
    """
    if len(input_shape) == 2:
        target_h, target_w = input_shape
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("L").resize((target_w, target_h))
            arr = np.asarray(img, dtype=np.float32) / 255.0
        return arr.reshape(1, -1).astype(np.float32)

    if len(input_shape) == 3 and input_shape[-1] == 3:
        target_h, target_w, _ = input_shape
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("RGB").resize((target_w, target_h))
            arr = np.asarray(img, dtype=np.float32) / 255.0
        arr = (arr - _IMAGENET_MEAN) / _IMAGENET_STD
        # HWC -> CHW -> NCHW
        return np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)

    raise ValueError(f"Unsupported MRI input_shape: {input_shape!r}")


def predict_from_image(image_bytes: bytes) -> dict[str, Any]:
    meta = load_meta(MODEL)
    classes: list[str] = meta["classes"]
    vec = _preprocess(image_bytes, meta["input_shape"])

    sess = load_session(MODEL)
    input_name = sess.get_inputs()[0].name
    outputs = sess.run(None, {input_name: vec})

    # Find the model output. The sklearn-MLP ONNX exports a softmax-
    # ed probability map; the CNN ONNX exports raw logits. Detect
    # which by looking at the row sum: rows that already sum to ~1
    # and are non-negative are probabilities; otherwise apply softmax.
    probs: np.ndarray | None = None
    for out in outputs:
        if isinstance(out, np.ndarray) and out.ndim == 2 and out.shape[-1] == len(classes):
            probs = out.astype(np.float32)
            break
        if isinstance(out, list) and out and isinstance(out[0], dict):
            d = out[0]
            probs = np.asarray([[float(d[k]) for k in classes]], dtype=np.float32)
            break
    if probs is None:
        probs = np.zeros((1, len(classes)), dtype=np.float32)

    row = probs[0]
    if row.min() < 0 or abs(float(row.sum()) - 1.0) > 1e-3:
        # Looks like raw logits — softmax to probabilities.
        shifted = row - row.max()
        ex = np.exp(shifted)
        row = ex / ex.sum()
        probs = row[None, :].astype(np.float32)

    flat = probs[0].astype(float)
    top_index = int(np.argmax(flat))
    top_label = classes[top_index]
    confidence = float(flat[top_index])
    # Positive-class shorthand: probability of "any dementia" (everything
    # except NonDemented). Lets the existing UI render a single band.
    non_index = classes.index("NonDemented") if "NonDemented" in classes else None
    if non_index is not None:
        prob_demented = float(1.0 - flat[non_index])
    else:
        prob_demented = float(1.0 - flat[0])
    band = "high" if prob_demented >= 0.66 else ("moderate" if prob_demented >= 0.33 else "low")
    return {
        "probability": prob_demented,
        "band": band,
        "classes": classes,
        "probabilities": flat.tolist(),
        "top": top_label,
        "confidence": confidence,
    }
