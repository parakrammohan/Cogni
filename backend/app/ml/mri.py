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


def _preprocess(image_bytes: bytes, input_shape: list[int]) -> tuple[np.ndarray, float]:
    """Decode bytes → preprocessed ONNX-ready tensor + a saturation score
    in [0, 1] for the out-of-distribution check.

    `input_shape` is the meta's declared shape. `[H, W]` (length 2) =
    legacy grayscale flat path; `[H, W, C]` with C==3 = CNN path.

    Resize uses **BILINEAR** to match `torchvision.transforms.Resize`'s
    default at training time. Pillow's default is BICUBIC since 9.1 —
    leaving the call argument-less would silently drift inference pixels
    away from anything the model saw at training.
    """
    if len(input_shape) == 2:
        target_h, target_w = input_shape
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("L").resize((target_w, target_h), Image.Resampling.BILINEAR)
            arr = np.asarray(img, dtype=np.float32) / 255.0
        return arr.reshape(1, -1).astype(np.float32), 0.0

    if len(input_shape) == 3 and input_shape[-1] == 3:
        target_h, target_w, _ = input_shape
        with Image.open(io.BytesIO(image_bytes)) as img:
            rgb = img.convert("RGB").resize((target_w, target_h), Image.Resampling.BILINEAR)
            arr = np.asarray(rgb, dtype=np.float32) / 255.0
        # Cheap out-of-distribution heuristic: real MRI slices are
        # effectively grayscale even after convert("RGB") — the three
        # channels are near-identical, so per-pixel max-vs-min is ~0.
        # A photo of a cat scores >0.1 here, a screenshot of text >0.2.
        # Used in predict_from_image to gate the prediction.
        max_c = arr.max(axis=2)
        min_c = arr.min(axis=2)
        saturation = float((max_c - min_c).mean()) if arr.size else 0.0
        arr = (arr - _IMAGENET_MEAN) / _IMAGENET_STD
        # HWC -> CHW -> NCHW
        nchw = np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)
        return nchw, saturation

    raise ValueError(f"Unsupported MRI input_shape: {input_shape!r}")


def _run_inference(sess, input_name: str, vec: np.ndarray, n_classes: int) -> np.ndarray:
    """Single forward pass → softmax probabilities of shape (1, n_classes).

    Handles both sklearn-MLP ONNX (already softmaxed) and timm CNN ONNX
    (raw logits) by detecting row-sum-≈1 vs presence of negatives.
    """
    outputs = sess.run(None, {input_name: vec})
    probs: np.ndarray | None = None
    for out in outputs:
        if isinstance(out, np.ndarray) and out.ndim == 2 and out.shape[-1] == n_classes:
            probs = out.astype(np.float32)
            break
        if isinstance(out, list) and out and isinstance(out[0], dict):
            d = out[0]
            probs = np.asarray([[float(d[k]) for k in d]], dtype=np.float32)
            break
    if probs is None:
        probs = np.zeros((1, n_classes), dtype=np.float32)
    row = probs[0]
    if row.min() < 0 or abs(float(row.sum()) - 1.0) > 1e-3:
        shifted = row - row.max()
        ex = np.exp(shifted)
        row = ex / ex.sum()
        probs = row[None, :].astype(np.float32)
    return probs


# OOD heuristic threshold. Real brain MRIs land at saturation < 0.02 (the
# three RGB channels are near-identical because the source is grayscale).
# A typical natural photo lands above 0.10. We refuse to predict above
# this cutoff and return an "unknown" band instead.
_MAX_BRAIN_MRI_SATURATION = 0.06
# If the top softmax confidence is below this, we also bail out — protects
# against the case where the OOD check passes (low-saturation but still
# not-an-MRI: a grayscale photo of text, a scanned X-ray, etc.).
_MIN_TOP_CONFIDENCE = 0.55


def predict_from_image(image_bytes: bytes) -> dict[str, Any]:
    meta = load_meta(MODEL)
    classes: list[str] = meta["classes"]
    vec, saturation = _preprocess(image_bytes, meta["input_shape"])

    sess = load_session(MODEL)
    input_name = sess.get_inputs()[0].name

    # Test-Time Augmentation: average the model's output on the original
    # input AND its horizontal flip. This MATCHES the val-time procedure
    # used at training (see datasets/scripts/train_alzheimer_mri_v2.py
    # val loop) — without it, the deployed model's headline macro-F1
    # would be ~0.5-1.5 pts lower than the meta claims because the model
    # was selected against a TTA'd evaluation. TTA is only meaningful
    # for the CNN path (4-D NCHW); the legacy MLP path is skipped.
    probs = _run_inference(sess, input_name, vec, len(classes))
    if vec.ndim == 4:
        flipped = np.ascontiguousarray(vec[:, :, :, ::-1])
        probs_flip = _run_inference(sess, input_name, flipped, len(classes))
        probs = ((probs + probs_flip) / 2.0).astype(np.float32)

    flat = probs[0].astype(float)
    top_index = int(np.argmax(flat))
    top_label = classes[top_index]
    confidence = float(flat[top_index])

    # Out-of-distribution gate. The model was trained on grayscale-as-RGB
    # brain MRIs and will confidently misclassify anything else (a cat
    # photo lands at "VeryMildDemented 86%" without this gate). Refuse
    # to commit to a prediction if the input isn't visually compatible
    # with the training distribution OR if no class clears the confidence
    # floor. The probability vector is still returned so the UI can show
    # the raw softmax if it wants.
    if saturation > _MAX_BRAIN_MRI_SATURATION or confidence < _MIN_TOP_CONFIDENCE:
        return {
            "probability": 0.0,
            "band": "low",
            "classes": classes,
            "probabilities": flat.tolist(),
            "top": "Unknown — not a brain MRI",
            "confidence": confidence,
            "needs_review": True,
        }

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
