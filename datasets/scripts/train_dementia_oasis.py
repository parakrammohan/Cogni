"""Train a gradient boosting model on the OASIS longitudinal dementia dataset
and export to ONNX.

Target: Group (Nondemented / Demented / Converted) — collapsed to a binary
"any cognitive impairment" target since Converted is rare and the clinical
question for the app is "is there cognitive impairment now?".

Some of the rows have missing values in SES and MMSE — we impute with column
median because the dataset is too small to drop them.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "dementia" / "dementia_dataset.csv"
OUT_DIR = ROOT / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> int:
    df = pd.read_csv(CSV)
    # Strip BOM-bearing column names
    df.columns = [c.strip().lstrip("﻿") for c in df.columns]
    print(f"loaded {len(df)} rows, columns: {list(df.columns)}")
    print(df["Group"].value_counts().to_dict())

    # Encode sex
    df["Sex"] = (df["M/F"] == "M").astype(int)
    # Binary target: Demented or Converted -> 1, Nondemented -> 0
    df["Target"] = (df["Group"] != "Nondemented").astype(int)

    feature_cols = [
        "Visit",
        "MR Delay",
        "Sex",
        "Age",
        "EDUC",
        "SES",
        "MMSE",
        "eTIV",
        "nWBV",
        "ASF",
    ]
    X = df[feature_cols].astype("float64").values
    y = df["Target"].values
    print(f"features: {len(feature_cols)}, class balance: {np.bincount(y)}")

    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("gbm", GradientBoostingClassifier(
            n_estimators=300, max_depth=3, learning_rate=0.05, random_state=42
        )),
    ])

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    fold_acc, fold_auc = [], []
    for fold, (tr, va) in enumerate(cv.split(X, y), start=1):
        pipe.fit(X[tr], y[tr])
        p = pipe.predict_proba(X[va])[:, 1]
        acc = accuracy_score(y[va], (p > 0.5).astype(int))
        auc = roc_auc_score(y[va], p)
        fold_acc.append(acc)
        fold_auc.append(auc)
        print(f"  fold {fold}: acc={acc:.3f}  auc={auc:.3f}")
    print(f"CV acc: {np.mean(fold_acc):.3f} ± {np.std(fold_acc):.3f}")
    print(f"CV auc: {np.mean(fold_auc):.3f} ± {np.std(fold_auc):.3f}")

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    pipe.fit(X_tr, y_tr)
    p_te = pipe.predict_proba(X_te)[:, 1]
    yhat = (p_te > 0.5).astype(int)
    print("\nHeld-out report:")
    print(classification_report(y_te, yhat, digits=3))
    print(f"AUC: {roc_auc_score(y_te, p_te):.3f}")
    print(f"Confusion matrix:\n{confusion_matrix(y_te, yhat)}")

    # Refit on all data with imputation done up front so we ship just the GBM
    imputer = SimpleImputer(strategy="median").fit(X)
    X_full = imputer.transform(X)
    shipped = GradientBoostingClassifier(
        n_estimators=400, max_depth=3, learning_rate=0.05, random_state=42
    )
    shipped.fit(X_full, y)

    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    initial_type = [("input", FloatTensorType([None, len(feature_cols)]))]
    onx = convert_sklearn(
        shipped,
        initial_types=initial_type,
        target_opset=17,
        options={id(shipped): {"zipmap": False}},
    )
    onnx_path = OUT_DIR / "dementia_oasis.onnx"
    onnx_path.write_bytes(onx.SerializeToString())
    print(f"wrote {onnx_path} ({onnx_path.stat().st_size / 1024:.1f} KiB)")

    meta = {
        "task": "binary_classification",
        "target": "Demented or Converted (vs Nondemented)",
        "classes": ["Nondemented", "Demented/Converted"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "imputation": "median",
        "imputation_values": {
            col: float(v) for col, v in zip(feature_cols, imputer.statistics_)
        },
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
    (OUT_DIR / "dementia_oasis.meta.json").write_text(json.dumps(meta, indent=2))

    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    sample = X_full[:5].astype(np.float32)
    out = sess.run(None, {"input": sample})
    sk = shipped.predict_proba(X_full[:5])
    print("\nONNX vs sklearn:")
    print(f"  onnx:    {out[1][:, 1] if out[1].ndim == 2 else out[1]}")
    print(f"  sklearn: {sk[:, 1]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
