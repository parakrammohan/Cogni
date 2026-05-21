"""Optimised LightGBM trainer for OASIS-2 dementia detection.

OASIS-2 has ~150 subjects with multiple visits each (373 total rows).
Random K-Fold leaks visits from the same subject across train/test,
inflating reported accuracy. The shipped meta records both
GroupKFold-by-subject and the legacy random-KFold numbers so a reader
can see the gap.

Targets: binary "Demented or Converted" vs "Nondemented".
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import GroupKFold, StratifiedKFold

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "datasets" / "dementia" / "dementia_dataset.csv"
ARTIFACTS_DIR = REPO / "backend" / "app" / "ml" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

CANDIDATES = [
    dict(num_leaves=7, learning_rate=0.05, min_child_samples=5, reg_lambda=0.5, reg_alpha=0.0),
    dict(num_leaves=15, learning_rate=0.05, min_child_samples=5, reg_lambda=0.5, reg_alpha=0.0),
    dict(num_leaves=15, learning_rate=0.05, min_child_samples=10, reg_lambda=1.0, reg_alpha=0.0),
    dict(num_leaves=31, learning_rate=0.03, min_child_samples=10, reg_lambda=1.0, reg_alpha=0.1),
    dict(num_leaves=31, learning_rate=0.03, min_child_samples=15, reg_lambda=2.0, reg_alpha=0.1),
    dict(num_leaves=63, learning_rate=0.02, min_child_samples=15, reg_lambda=3.0, reg_alpha=0.2),
]
RANDOM_STATE = 42


def cv_score(
    X: np.ndarray, y: np.ndarray, groups: np.ndarray | None, params: dict
) -> dict:
    splitter = (
        GroupKFold(n_splits=5)
        if groups is not None
        else StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    )
    accs, aucs, best_iters = [], [], []
    iterator = splitter.split(X, y, groups) if groups is not None else splitter.split(X, y)
    for fold, (tr, va) in enumerate(iterator, start=1):
        # Fit imputer on train fold only (correct for subject-aware CV).
        imp = SimpleImputer(strategy="median").fit(X[tr])
        X_tr, X_va = imp.transform(X[tr]), imp.transform(X[va])
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
            X_tr, y[tr],
            eval_set=[(X_va, y[va])],
            eval_metric="auc",
            callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)],
        )
        p = clf.predict_proba(X_va)[:, 1]
        accs.append(accuracy_score(y[va], (p > 0.5).astype(int)))
        aucs.append(roc_auc_score(y[va], p))
        best_iters.append(int(clf.best_iteration_ or clf.n_estimators))
    return {
        "acc_mean": float(np.mean(accs)),
        "acc_std": float(np.std(accs)),
        "auc_mean": float(np.mean(aucs)),
        "auc_std": float(np.std(aucs)),
        "best_iter_median": int(np.median(best_iters)),
    }


def main() -> int:
    df = pd.read_csv(CSV)
    df.columns = [c.strip().lstrip("﻿") for c in df.columns]
    print(f"loaded {len(df)} rows, {df['Subject ID'].nunique()} subjects")
    print("Group counts:", df["Group"].value_counts().to_dict())

    df["Sex"] = (df["M/F"] == "M").astype(int)
    df["Target"] = (df["Group"] != "Nondemented").astype(int)

    feature_cols = [
        "Visit", "MR Delay", "Sex", "Age", "EDUC", "SES", "MMSE", "eTIV", "nWBV", "ASF",
    ]
    X = df[feature_cols].astype("float64").values
    y = df["Target"].values
    groups = df["Subject ID"].values
    print(f"features: {len(feature_cols)}, class balance: {np.bincount(y).tolist()}")

    # Selection: use GroupKFold so we pick the genuinely best generaliser,
    # not the one that happened to win on a leaky split.
    best = None
    print("\nGroupKFold-by-subject search:")
    for idx, params in enumerate(CANDIDATES, 1):
        t0 = time.time()
        m = cv_score(X, y, groups, params)
        dt = time.time() - t0
        print(
            f"  [{idx}/{len(CANDIDATES)}] {params}\n"
            f"        groupkfold  acc {m['acc_mean']:.4f} ± {m['acc_std']:.4f}"
            f"   auc {m['auc_mean']:.4f} ± {m['auc_std']:.4f}"
            f"   iter {m['best_iter_median']}   {dt:.1f}s"
        )
        if best is None or m["auc_mean"] > best["m"]["auc_mean"]:
            best = {"params": params, "m": m}

    assert best is not None
    print(f"\nBest config (by GroupKFold AUC): {best['params']}")

    # Also report random-KFold metrics with the same config so the
    # reader can compare against the legacy 81% number.
    random_m = cv_score(X, y, None, best["params"])
    print(
        f"  random KFold  acc {random_m['acc_mean']:.4f} ± {random_m['acc_std']:.4f}"
        f"   auc {random_m['auc_mean']:.4f} ± {random_m['auc_std']:.4f}"
    )
    print(
        f"  groupkfold    acc {best['m']['acc_mean']:.4f} ± {best['m']['acc_std']:.4f}"
        f"   auc {best['m']['auc_mean']:.4f} ± {best['m']['auc_std']:.4f}"
    )

    # Final model — refit on every row with the chosen config.
    imp_full = SimpleImputer(strategy="median").fit(X)
    X_full = imp_full.transform(X)
    n_est = max(200, best["m"]["best_iter_median"])
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
    shipped.fit(X_full, y)

    out_model = ARTIFACTS_DIR / "dementia_oasis.joblib"
    joblib.dump({"model": shipped, "features": feature_cols}, out_model, compress=3)
    print(f"\nwrote {out_model} ({out_model.stat().st_size / 1024:.1f} KiB)")

    meta = {
        "task": "binary_classification",
        "target": "Demented or Converted (vs Nondemented)",
        "classes": ["Nondemented", "Demented/Converted"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "imputation": "median",
        "imputation_values": {
            col: float(v) for col, v in zip(feature_cols, imp_full.statistics_)
        },
        "metrics": {
            "cv_accuracy_mean": random_m["acc_mean"],
            "cv_accuracy_std": random_m["acc_std"],
            "cv_auc_mean": random_m["auc_mean"],
            "cv_auc_std": random_m["auc_std"],
            "groupkfold_accuracy_mean": best["m"]["acc_mean"],
            "groupkfold_accuracy_std": best["m"]["acc_std"],
            "groupkfold_auc_mean": best["m"]["auc_mean"],
            "groupkfold_auc_std": best["m"]["auc_std"],
        },
        "training_rows": int(len(df)),
        "training_subjects": int(df["Subject ID"].nunique()),
        "model_type": "LightGBM (binary, gradient boosted trees)",
        "hyperparameters": {**best["params"], "n_estimators": n_est},
        "caveats": [
            "OASIS-2 has ~2.5 visits per subject. Random K-Fold leaks visits across train/test — the cv_accuracy_mean number reflects that traditional evaluation. The groupkfold_accuracy_mean is the honest subject-aware estimate."
        ],
    }
    meta_path = ARTIFACTS_DIR / "dementia_oasis.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"wrote {meta_path}")

    public_meta = REPO / "public" / "models" / "dementia_oasis.meta.json"
    if public_meta.parent.exists():
        public_meta.write_text(json.dumps(meta, indent=2))
        print(f"wrote {public_meta}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
