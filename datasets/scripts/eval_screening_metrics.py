"""Backfill honest precision / recall / F1 / accuracy into each tabular meta.

Re-fits the trained estimator inside each CV fold (using the saved
hyperparameters from the shipped joblib) and aggregates the per-fold
held-out metrics. That makes accuracy/precision/recall/F1 honest in
the same way `groupkfold_auc_mean` is — the model under evaluation
never sees the fold being scored.

For `alzheimer_tabular`: 5-fold stratified KFold.
For `dementia_oasis`:    5-fold GroupKFold-by-subject (single seed; the
                         3-seed CV from training is overkill for an
                         eval-only pass).
For `adresso_agitation`: 5-fold GroupKFold-by-patient.

Threshold: p>=0.5 for precision/recall/F1 (matches the UI bands).
"""

from __future__ import annotations

import importlib.util
import json
import sys
import warnings
from pathlib import Path
from typing import Any

import catboost as cb
import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold, StratifiedKFold

warnings.filterwarnings("ignore", category=UserWarning)

REPO = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = REPO / "backend" / "app" / "ml" / "artifacts"
PUBLIC_DIR = REPO / "public" / "models"


def score(y_true, p, threshold: float = 0.5) -> dict[str, float]:
    pred = (p >= threshold).astype(int)
    out: dict[str, float] = {
        "accuracy": float(accuracy_score(y_true, pred)),
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "f1": float(f1_score(y_true, pred, zero_division=0)),
    }
    if (y_true == 1).any() and (y_true == 0).any():
        out["auc"] = float(roc_auc_score(y_true, p))
        out["average_precision"] = float(average_precision_score(y_true, p))
    return out


def aggregate(folds: list[dict[str, float]]) -> dict[str, float]:
    keys = folds[0].keys()
    return {k: float(np.mean([f[k] for f in folds])) for k in keys}


def build_fresh(algo: str, hyperparams: dict[str, Any]):
    """Construct a fresh untrained estimator with the same
    hyperparameters as the shipped model. `hyperparams` is whatever
    Optuna landed on (no `n_estimators` — we use a fixed 400)."""
    params = {k: v for k, v in hyperparams.items() if v is not None}
    if algo == "lgbm":
        boosting = params.get("boosting_type", "gbdt")
        return lgb.LGBMClassifier(
            objective="binary",
            n_estimators=400 if boosting == "dart" else 600,
            random_state=42,
            n_jobs=-1,
            verbosity=-1,
            **params,
        )
    if algo == "xgb":
        return xgb.XGBClassifier(
            objective="binary:logistic",
            n_estimators=400,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
            tree_method="hist",
            **params,
        )
    return cb.CatBoostClassifier(
        iterations=400,
        loss_function="Logloss",
        verbose=False,
        random_seed=42,
        allow_writing_files=False,
        **params,
    )


# ============================================================ alzheimer_tabular

def eval_alzheimer():
    bundle = joblib.load(ARTIFACTS_DIR / "alzheimer_tabular.joblib")
    meta = json.loads((ARTIFACTS_DIR / "alzheimer_tabular.meta.json").read_text())
    df = pd.read_csv(REPO / "datasets" / "alzheimer_tabular" / "alzheimers_disease_data.csv")
    feature_cols = bundle["features"]
    X = df[feature_cols].astype("float64").values
    y = df["Diagnosis"].astype("int64").values

    hp = meta["hyperparameters"]
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    folds: list[dict[str, float]] = []
    for tr, va in cv.split(X, y):
        clf = lgb.LGBMClassifier(
            objective="binary",
            n_estimators=hp.get("n_estimators", 600),
            learning_rate=hp.get("learning_rate", 0.05),
            num_leaves=hp.get("num_leaves", 15),
            min_child_samples=hp.get("min_child_samples", 10),
            reg_lambda=hp.get("reg_lambda", 0.0),
            reg_alpha=hp.get("reg_alpha", 0.0),
            random_state=42, n_jobs=-1, verbosity=-1,
        )
        clf.fit(X[tr], y[tr])
        folds.append(score(y[va], clf.predict_proba(X[va])[:, 1]))
    return aggregate(folds)


# ============================================================ dementia_oasis

def eval_dementia():
    bundle = joblib.load(ARTIFACTS_DIR / "dementia_oasis.joblib")
    meta = json.loads((ARTIFACTS_DIR / "dementia_oasis.meta.json").read_text())
    spec = importlib.util.spec_from_file_location(
        "dementia_v4", REPO / "datasets" / "scripts" / "train_dementia_oasis_v4.py"
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    df = pd.read_csv(REPO / "datasets" / "dementia" / "dementia_dataset.csv")
    X_df, y, groups, _ = mod.build_features(df)
    X = X_df.values

    framework = bundle.get("framework", "catboost")
    hp = meta["hyperparameters"]
    splitter = GroupKFold(n_splits=5)
    folds: list[dict[str, float]] = []
    for tr, va in splitter.split(X, y, groups):
        if not ((y[va] == 1).any() and (y[va] == 0).any()):
            continue
        imp = SimpleImputer(strategy="median").fit(X[tr])
        clf = build_fresh(framework, hp)
        clf.fit(imp.transform(X[tr]), y[tr])
        folds.append(score(y[va], clf.predict_proba(imp.transform(X[va]))[:, 1]))
    return aggregate(folds)


# ============================================================ adresso_agitation

def eval_adresso():
    bundle = joblib.load(ARTIFACTS_DIR / "adresso_agitation.joblib")
    meta = json.loads((ARTIFACTS_DIR / "adresso_agitation.meta.json").read_text())
    spec = importlib.util.spec_from_file_location(
        "adresso_v3", REPO / "datasets" / "scripts" / "train_adresso_agitation_v3.py"
    )
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    X_df, y, groups, _ = mod.build_features()
    X = X_df.values

    framework = bundle.get("framework", "catboost")
    hp = meta["hyperparameters"]
    splitter = GroupKFold(n_splits=5)
    folds: list[dict[str, float]] = []
    for tr, va in splitter.split(X, y, groups):
        if not ((y[va] == 1).any() and (y[va] == 0).any()):
            continue
        clf = build_fresh(framework, hp)
        clf.fit(X[tr], y[tr])
        folds.append(score(y[va], clf.predict_proba(X[va])[:, 1]))
    return aggregate(folds)


# ============================================================ Driver

def write_metrics(model_key: str, metrics: dict[str, float]) -> None:
    meta_path = ARTIFACTS_DIR / f"{model_key}.meta.json"
    meta = json.loads(meta_path.read_text())
    existing = meta.get("metrics") or {}
    existing.update(
        {
            "cv_accuracy": metrics["accuracy"],
            "cv_precision": metrics["precision"],
            "cv_recall": metrics["recall"],
            "cv_f1": metrics["f1"],
            "cv_auc": metrics.get("auc"),
            "cv_average_precision": metrics.get("average_precision"),
        }
    )
    meta["metrics"] = existing
    meta_path.write_text(json.dumps(meta, indent=2))
    public_path = PUBLIC_DIR / f"{model_key}.meta.json"
    if public_path.parent.exists():
        public_path.write_text(json.dumps(meta, indent=2))
    print(f"  {model_key}: " + ", ".join(f"{k}={v:.4f}" for k, v in metrics.items()))


def main() -> int:
    print("alzheimer_tabular:")
    write_metrics("alzheimer_tabular", eval_alzheimer())
    print("dementia_oasis:")
    write_metrics("dementia_oasis", eval_dementia())
    print("adresso_agitation:")
    write_metrics("adresso_agitation", eval_adresso())
    return 0


if __name__ == "__main__":
    sys.exit(main())
