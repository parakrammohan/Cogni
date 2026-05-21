"""Train an LightGBM classifier on the Kaggle Alzheimer's tabular dataset
and export it to ONNX for in-browser inference.

Inputs
------
datasets/alzheimer_tabular/alzheimers_disease_data.csv

Outputs
-------
datasets/models/alzheimer_tabular.onnx
datasets/models/alzheimer_tabular.meta.json
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "alzheimer_tabular" / "alzheimers_disease_data.csv"
OUT_DIR = ROOT / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> int:
    df = pd.read_csv(CSV)
    print(f"loaded {len(df)} rows, {len(df.columns)} cols")

    # PatientID and DoctorInCharge are non-predictive identifiers
    drop_cols = ["PatientID", "DoctorInCharge"]
    target = "Diagnosis"
    feature_cols = [c for c in df.columns if c not in drop_cols + [target]]

    X = df[feature_cols].astype("float64").values
    y = df[target].astype("int64").values

    print(f"features: {len(feature_cols)}, class balance: {np.bincount(y)}")

    # Stratified 5-fold CV for an honest accuracy/AUC estimate
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    fold_acc, fold_auc = [], []
    for fold, (tr, va) in enumerate(cv.split(X, y), start=1):
        m = GradientBoostingClassifier(
            n_estimators=400, max_depth=3, learning_rate=0.05, random_state=42
        )
        m.fit(X[tr], y[tr])
        p = m.predict_proba(X[va])[:, 1]
        acc = accuracy_score(y[va], (p > 0.5).astype(int))
        auc = roc_auc_score(y[va], p)
        fold_acc.append(acc)
        fold_auc.append(auc)
        print(f"  fold {fold}: acc={acc:.3f}  auc={auc:.3f}")
    print(f"CV acc: {np.mean(fold_acc):.3f} ± {np.std(fold_acc):.3f}")
    print(f"CV auc: {np.mean(fold_auc):.3f} ± {np.std(fold_auc):.3f}")

    # Final fit on full training split, evaluate on held-out test split too
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    final = GradientBoostingClassifier(
        n_estimators=600, max_depth=3, learning_rate=0.05, random_state=42
    )
    final.fit(X_tr, y_tr)
    p_te = final.predict_proba(X_te)[:, 1]
    yhat = (p_te > 0.5).astype(int)
    print("\nHeld-out report:")
    print(classification_report(y_te, yhat, digits=3))
    print(f"AUC: {roc_auc_score(y_te, p_te):.3f}")
    print(f"Confusion matrix:\n{confusion_matrix(y_te, yhat)}")

    # Refit on ALL data for the shipped model
    shipped = GradientBoostingClassifier(
        n_estimators=600, max_depth=3, learning_rate=0.05, random_state=42
    )
    shipped.fit(X, y)

    # Export to ONNX
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    initial_type = [("input", FloatTensorType([None, len(feature_cols)]))]
    onx = convert_sklearn(
        shipped,
        initial_types=initial_type,
        target_opset=17,
        options={id(shipped): {"zipmap": False}},
    )
    onnx_path = OUT_DIR / "alzheimer_tabular.onnx"
    onnx_path.write_bytes(onx.SerializeToString())
    print(f"wrote {onnx_path} ({onnx_path.stat().st_size / 1024:.1f} KiB)")

    meta = {
        "task": "binary_classification",
        "target": target,
        "classes": ["No Alzheimer's", "Alzheimer's"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "metrics": {
            "cv_accuracy_mean": float(np.mean(fold_acc)),
            "cv_accuracy_std": float(np.std(fold_acc)),
            "cv_auc_mean": float(np.mean(fold_auc)),
            "cv_auc_std": float(np.std(fold_auc)),
            "holdout_accuracy": float(accuracy_score(y_te, yhat)),
            "holdout_auc": float(roc_auc_score(y_te, p_te)),
        },
        "training_rows": int(len(df)),
        "model_type": "GradientBoostingClassifier",
    }
    meta_path = OUT_DIR / "alzheimer_tabular.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"wrote {meta_path}")

    # Sanity check ONNX inference
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    sample = X[:5].astype(np.float32)
    out = sess.run(None, {"input": sample})
    sk = shipped.predict_proba(X[:5])
    print("\nONNX vs sklearn (probability column 1):")
    print(f"  onnx:    {out[1][:, 1] if out[1].ndim == 2 else out[1]}")
    print(f"  sklearn: {sk[:, 1]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
