"""4-class Alzheimer's MRI classifier.

PyTorch is currently broken on Python 3.14 + Windows (DLL init), so this
script uses a sklearn pipeline that is still ONNX-exportable and small
enough to ship to the browser:

  resize 64x64 grayscale -> flatten (4096) -> StandardScaler ->
  PCA(128) -> HistGradientBoostingClassifier (multiclass)

A subsample (configurable) is used to keep training time reasonable on CPU.

CAVEAT: the Kaggle combined_images set contains augmented variants of the
same underlying patient slices, so train/test splits at the *image* level
leak strongly. Reported accuracy is therefore optimistic. Real-world
accuracy on a fully unseen patient would be lower.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.decomposition import PCA
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "alzheimer_mri" / "combined_images"
OUT_DIR = ROOT / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CLASSES = ["NonDemented", "VeryMildDemented", "MildDemented", "ModerateDemented"]
IMG_SIZE = 64
PER_CLASS = 3000  # ~12k total — keeps memory + training under a minute


def load_subset() -> tuple[np.ndarray, np.ndarray]:
    rng = random.Random(42)
    X, y = [], []
    for cls_idx, cls_name in enumerate(CLASSES):
        cls_dir = IMG_DIR / cls_name
        files = sorted(cls_dir.iterdir())
        if len(files) > PER_CLASS:
            files = rng.sample(files, PER_CLASS)
        for f in files:
            try:
                img = Image.open(f).convert("L").resize((IMG_SIZE, IMG_SIZE))
            except Exception:
                continue
            X.append(np.asarray(img, dtype=np.float32).ravel() / 255.0)
            y.append(cls_idx)
        print(f"  {cls_name}: {len(files)} images")
    return np.asarray(X, dtype=np.float32), np.asarray(y, dtype=np.int64)


def main() -> int:
    print(f"loading images at {IMG_SIZE}x{IMG_SIZE}, up to {PER_CLASS} per class...")
    X, y = load_subset()
    print(f"\nshape: X={X.shape}  y={y.shape}  classes={np.bincount(y)}")

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"train={X_tr.shape}  test={X_te.shape}")

    pipe = Pipeline([
        ("scale", StandardScaler(with_mean=True, with_std=True)),
        ("pca", PCA(n_components=128, random_state=42)),
        ("mlp", MLPClassifier(
            hidden_layer_sizes=(256, 128),
            activation="relu",
            solver="adam",
            alpha=1e-4,
            batch_size=128,
            learning_rate_init=1e-3,
            max_iter=80,
            early_stopping=True,
            n_iter_no_change=8,
            random_state=42,
            verbose=False,
        )),
    ])

    print("\ntraining pipeline (StandardScaler -> PCA(128) -> MLP)...")
    pipe.fit(X_tr, y_tr)
    yhat = pipe.predict(X_te)
    proba = pipe.predict_proba(X_te)

    acc = accuracy_score(y_te, yhat)
    print(f"\nTest accuracy: {acc:.3f}")
    print(classification_report(y_te, yhat, target_names=CLASSES, digits=3))
    cm = confusion_matrix(y_te, yhat)
    print("Confusion matrix:")
    print(cm)

    # Refit on full data
    print("\nrefitting on full dataset for shipped model...")
    pipe.fit(X, y)

    # ONNX export
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    initial_type = [("input", FloatTensorType([None, IMG_SIZE * IMG_SIZE]))]
    onx = convert_sklearn(
        pipe,
        initial_types=initial_type,
        target_opset=17,
        options={id(pipe.named_steps["mlp"]): {"zipmap": False}},
    )
    onnx_path = OUT_DIR / "alzheimer_mri.onnx"
    onnx_path.write_bytes(onx.SerializeToString())
    print(f"wrote {onnx_path} ({onnx_path.stat().st_size / (1024 * 1024):.2f} MiB)")

    meta = {
        "task": "multiclass_classification",
        "classes": CLASSES,
        "input_shape": [IMG_SIZE, IMG_SIZE],
        "input_layout": "grayscale flattened, normalized to [0, 1]",
        "preprocess_steps": [
            f"convert grayscale, resize to {IMG_SIZE}x{IMG_SIZE}",
            "divide by 255",
            "flatten row-major",
        ],
        "metrics": {
            "test_accuracy": float(acc),
            "test_size": int(len(y_te)),
            "train_size": int(len(y_tr)),
        },
        "training_subset_per_class": PER_CLASS,
        "model_type": "StandardScaler + PCA(128) + MLPClassifier(256, 128)",
        "caveats": [
            "The Kaggle combined_images set augments the same underlying patient "
            "slices many times; image-level train/test splits leak between sets. "
            "Reported accuracy overstates clinical performance on truly unseen "
            "patients. Treat as a demo, not a diagnostic claim.",
            "Brain MRI scans are not what this app's webcam captures — this model "
            "is only useful as an 'upload an MRI' demo flow, not passive monitoring.",
        ],
    }
    (OUT_DIR / "alzheimer_mri.meta.json").write_text(json.dumps(meta, indent=2))

    # ONNX sanity check
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inputs = {sess.get_inputs()[0].name: X_te[:5].astype(np.float32)}
    out = sess.run(None, inputs)
    print(f"\nonnx outputs: {[o.shape for o in out]}")
    print(f"onnx pred labels: {out[0][:5]}")
    print(f"sklearn pred:     {pipe.predict(X_te[:5])}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
