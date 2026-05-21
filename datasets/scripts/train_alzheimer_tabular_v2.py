"""Optimised LightGBM trainer for the Alzheimer's tabular dataset.

Single LightGBM classifier per spec. Light hyperparameter search over a
handful of promising configurations (full grid would be wasteful here).
5-fold stratified CV gives an honest accuracy estimate; the shipped
model is refit on every row at the chosen config.

Output goes to backend/app/ml/artifacts/alzheimer_tabular.joblib so the
FastAPI service can load it directly. Updated .meta.json carries the
new feature list + metrics.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "datasets" / "alzheimer_tabular" / "alzheimers_disease_data.csv"
ARTIFACTS_DIR = REPO / "backend" / "app" / "ml" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

# Candidate configurations. LightGBM converges fast so 6 configs across
# the depth/learning-rate plane is enough — exhaustive grids overfit the
# small holdout split.
CANDIDATES = [
    dict(num_leaves=15, learning_rate=0.05, min_child_samples=10, reg_lambda=0.0, reg_alpha=0.0),
    dict(num_leaves=31, learning_rate=0.05, min_child_samples=10, reg_lambda=0.0, reg_alpha=0.0),
    dict(num_leaves=31, learning_rate=0.05, min_child_samples=20, reg_lambda=0.1, reg_alpha=0.0),
    dict(num_leaves=63, learning_rate=0.03, min_child_samples=20, reg_lambda=0.1, reg_alpha=0.0),
    dict(num_leaves=63, learning_rate=0.03, min_child_samples=30, reg_lambda=0.5, reg_alpha=0.1),
    dict(num_leaves=127, learning_rate=0.02, min_child_samples=30, reg_lambda=0.5, reg_alpha=0.1),
]
RANDOM_STATE = 42


def cv_evaluate(X: np.ndarray, y: np.ndarray, params: dict) -> dict:
    """5-fold stratified CV with early stopping on a per-fold val split."""
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    accs, aucs, best_iters = [], [], []
    for fold, (tr, va) in enumerate(cv.split(X, y), start=1):
        clf = lgb.LGBMClassifier(
            objective="binary",
            n_estimators=2000,
            learning_rate=params["learning_rate"],
            num_leaves=params["num_leaves"],
            min_child_samples=params["min_child_samples"],
            reg_lambda=params["reg_lambda"],
            reg_alpha=params["reg_alpha"],
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbosity=-1,
        )
        clf.fit(
            X[tr], y[tr],
            eval_set=[(X[va], y[va])],
            eval_metric="auc",
            callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)],
        )
        p = clf.predict_proba(X[va])[:, 1]
        accs.append(accuracy_score(y[va], (p > 0.5).astype(int)))
        aucs.append(roc_auc_score(y[va], p))
        best_iters.append(int(clf.best_iteration_ or clf.n_estimators))
    return {
        "acc_mean": float(np.mean(accs)),
        "acc_std": float(np.std(accs)),
        "auc_mean": float(np.mean(aucs)),
        "auc_std": float(np.std(aucs)),
        "best_iter_median": int(np.median(best_iters)),
        "accs": accs,
        "aucs": aucs,
    }


def main() -> int:
    df = pd.read_csv(CSV)
    drop_cols = ["PatientID", "DoctorInCharge"]
    target = "Diagnosis"
    feature_cols = [c for c in df.columns if c not in drop_cols + [target]]

    X = df[feature_cols].astype("float64").values
    y = df[target].astype("int64").values
    print(f"loaded {len(df)} rows, {len(feature_cols)} features, classes {np.bincount(y).tolist()}")

    best = None
    print("\nCandidate search (5-fold stratified CV with early stopping):")
    for idx, params in enumerate(CANDIDATES, 1):
        t0 = time.time()
        metrics = cv_evaluate(X, y, params)
        dt = time.time() - t0
        print(
            f"  [{idx}/{len(CANDIDATES)}] {params}\n"
            f"        acc {metrics['acc_mean']:.4f} ± {metrics['acc_std']:.4f}"
            f"   auc {metrics['auc_mean']:.4f} ± {metrics['auc_std']:.4f}"
            f"   best_iter_median {metrics['best_iter_median']}   {dt:.1f}s"
        )
        if best is None or metrics["acc_mean"] > best["metrics"]["acc_mean"]:
            best = {"params": params, "metrics": metrics}

    assert best is not None
    print(f"\nBest config: {best['params']}")
    print(
        f"        acc {best['metrics']['acc_mean']:.4f} ± {best['metrics']['acc_std']:.4f}"
        f"   auc {best['metrics']['auc_mean']:.4f} ± {best['metrics']['auc_std']:.4f}"
    )

    # Final model — fit on every row at the best config's median best_iter.
    n_est = max(100, best["metrics"]["best_iter_median"])
    shipped = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=n_est,
        learning_rate=best["params"]["learning_rate"],
        num_leaves=best["params"]["num_leaves"],
        min_child_samples=best["params"]["min_child_samples"],
        reg_lambda=best["params"]["reg_lambda"],
        reg_alpha=best["params"]["reg_alpha"],
        random_state=RANDOM_STATE,
        n_jobs=-1,
        verbosity=-1,
    )
    shipped.fit(X, y)

    out_model = ARTIFACTS_DIR / "alzheimer_tabular.joblib"
    joblib.dump({"model": shipped, "features": feature_cols}, out_model, compress=3)
    size_kb = out_model.stat().st_size / 1024
    print(f"\nwrote {out_model} ({size_kb:.1f} KiB)")

    meta = {
        "task": "binary_classification",
        "target": target,
        "classes": ["No Alzheimer's", "Alzheimer's"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "metrics": {
            "cv_accuracy_mean": best["metrics"]["acc_mean"],
            "cv_accuracy_std": best["metrics"]["acc_std"],
            "cv_auc_mean": best["metrics"]["auc_mean"],
            "cv_auc_std": best["metrics"]["auc_std"],
        },
        "training_rows": int(len(df)),
        "model_type": "LightGBM (binary, gradient boosted trees)",
        "hyperparameters": {**best["params"], "n_estimators": n_est},
    }
    # Also drop a colocated meta JSON so the frontend's form-schema
    # loader keeps working (it pulls /public/models/<key>.meta.json).
    meta_path = ARTIFACTS_DIR / "alzheimer_tabular.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"wrote {meta_path}")

    public_meta = REPO / "public" / "models" / "alzheimer_tabular.meta.json"
    if public_meta.parent.exists():
        public_meta.write_text(json.dumps(meta, indent=2))
        print(f"wrote {public_meta}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
