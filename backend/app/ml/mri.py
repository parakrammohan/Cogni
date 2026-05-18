"""MRI ONNX inference — image upload → 64x64 grayscale → normalised
flat vector → multiclass probabilities."""

from __future__ import annotations

import io
from typing import Any

import numpy as np
from PIL import Image

from app.ml.loader import load_meta, load_session

MODEL = "alzheimer_mri"


def predict_from_image(image_bytes: bytes) -> dict[str, Any]:
    meta = load_meta(MODEL)
    target_h, target_w = meta["input_shape"]
    classes: list[str] = meta["classes"]

    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("L").resize((target_w, target_h))
        arr = np.asarray(img, dtype=np.float32) / 255.0
    vec = arr.reshape(1, -1).astype(np.float32)

    sess = load_session(MODEL)
    input_name = sess.get_inputs()[0].name
    outputs = sess.run(None, {input_name: vec})

    # Find the probability tensor.
    probs: np.ndarray | None = None
    for out in outputs:
        if isinstance(out, np.ndarray) and out.ndim == 2 and out.shape[-1] == len(classes):
            probs = out
            break
        if isinstance(out, list) and out and isinstance(out[0], dict):
            d = out[0]
            probs = np.asarray([[float(d[k]) for k in classes]], dtype=np.float32)
            break
    if probs is None:
        probs = np.zeros((1, len(classes)), dtype=np.float32)

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
