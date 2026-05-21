"""adresso_agitation v2 — LightGBM/XGBoost sweep with class-balanced
weights and GroupKFold-by-patient.

Pitfalls this script intentionally avoids:
- Random K-Fold leaks correlated (same-patient, adjacent-day) rows. We
  use GroupKFold by patient_id so the held-out fold has no overlap.
- "Accuracy" is meaningless at 4% prevalence (predicting 0 always gives
  ~96%). The selection metric is GroupKFold AUC and we also report
  average precision (AP) which is the right tail-detection metric.
- Class imbalance — every classifier fits with sample_weight = inverse
  class frequency.

Reuses the feature engineering from the original v1 script.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import time
from itertools import product
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold

REPO = Path(__file__).resolve().parents[2]
SCRIPT_V1 = REPO / "datasets" / "scripts" / "train_adresso_agitation.py"
DATASET = REPO / "datasets" / "adresso" / "Dataset"
ARTIFACTS_DIR = REPO / "backend" / "app" / "ml" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

# Import v1's feature builders so we don't duplicate ~80 lines of pandas.
spec = importlib.util.spec_from_file_location("adresso_v1", SCRIPT_V1)
assert spec is not None and spec.loader is not None
v1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v1)
build_activity_features = v1.build_activity_features
build_physiology_features = v1.build_physiology_features
build_sleep_features = v1.build_sleep_features

RANDOM_STATE = 42


def load_feature_frame() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    print("loading + feature engineering...")
    activity = pd.read_csv(DATASET / "Activity.csv", parse_dates=["date"])
    sleep = pd.read_csv(DATASET / "Sleep.csv", parse_dates=["date"])
    phys = pd.read_csv(DATASET / "Physiology.csv", parse_dates=["date"])
    labels = pd.read_csv(DATASET / "Labels.csv", parse_dates=["date"])
    demo = pd.read_csv(DATASET / "Demographics.csv")

    af = build_activity_features(activity)
    pf = build_physiology_features(phys)
    sf = build_sleep_features(sleep)
    df = af.merge(pf, on=["patient_id", "day"], how="left")
    df = df.merge(sf, on=["patient_id", "day"], how="left")

    demo = demo.copy()
    demo["age_low"] = demo["age"].astype(str).str.extract(r"\((\d+)").astype(float)
    demo["sex_male"] = (demo["sex"] == "Male").astype(int)
    df = df.merge(demo[["patient_id", "age_low", "sex_male"]], on="patient_id", how="left")

    agit = labels[labels["type"] == "Agitation"].copy()
    agit["day"] = agit["date"].dt.normalize()
    agit_set = set(zip(agit["patient_id"], agit["day"]))
    df["target"] = [int((p, d) in agit_set) for p, d in zip(df["patient_id"], df["day"])]

    feature_cols = [c for c in df.columns if c not in {"patient_id", "day", "target"}]
    X = df[feature_cols].astype("float64").fillna(-1.0).values
    y = df["target"].values
    groups = df["patient_id"].values
    print(
        f"rows={len(df):,}  positives={int(y.sum())}  prevalence={y.mean():.3f}  "
        f"patients={pd.Series(groups).nunique()}  features={len(feature_cols)}"
    )
    return X, y, groups, feature_cols


def build_lgbm_grid() -> list[dict[str, Any]]:
    grid = []
    for nl, lr, mcs, lam in product(
        [7, 15, 31],
        [0.02, 0.05, 0.1],
        [10, 30, 60],
        [0.0, 1.0, 5.0],
    ):
        grid.append(
            {
                "framework": "lgbm",
                "num_leaves": nl,
                "learning_rate": lr,
                "min_child_samples": mcs,
                "reg_lambda": lam,
                "reg_alpha": 0.0,
            }
        )
    return grid


def build_xgb_grid() -> list[dict[str, Any]]:
    grid = []
    for md, lr, mcw, lam in product(
        [3, 4, 5, 6],
        [0.02, 0.05, 0.1],
        [3, 10, 30],
        [0.0, 1.0, 5.0],
    ):
        grid.append(
            {
                "framework": "xgb",
                "max_depth": md,
                "learning_rate": lr,
                "min_child_weight": mcw,
                "reg_lambda": lam,
                "reg_alpha": 0.0,
            }
        )
    return grid


def fit_fold(X_tr, y_tr, X_va, y_va, params, sw_tr):
    if params["framework"] == "lgbm":
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
            X_tr, y_tr,
            sample_weight=sw_tr,
            eval_set=[(X_va, y_va)],
            eval_metric="auc",
            callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)],
        )
        p = clf.predict_proba(X_va)[:, 1]
        best_iter = int(clf.best_iteration_ or clf.n_estimators)
    else:
        clf = xgb.XGBClassifier(
            objective="binary:logistic",
            n_estimators=2000,
            learning_rate=params["learning_rate"],
            max_depth=params["max_depth"],
            min_child_weight=params["min_child_weight"],
            reg_lambda=params["reg_lambda"],
            reg_alpha=params["reg_alpha"],
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbosity=0,
            eval_metric="auc",
            early_stopping_rounds=50,
            tree_method="hist",
        )
        clf.fit(X_tr, y_tr, sample_weight=sw_tr, eval_set=[(X_va, y_va)], verbose=False)
        p = clf.predict_proba(X_va)[:, 1]
        best_iter = int(clf.best_iteration or clf.n_estimators)
    auc = roc_auc_score(y_va, p) if (y_va == 1).any() else float("nan")
    ap = average_precision_score(y_va, p) if (y_va == 1).any() else float("nan")
    return auc, ap, best_iter


def cv_score(X, y, groups, params) -> dict:
    splitter = GroupKFold(n_splits=5)
    aucs, aps, bests = [], [], []
    for tr, va in splitter.split(X, y, groups):
        pos = (y[tr] == 1).sum()
        neg = (y[tr] == 0).sum()
        pos_w = neg / max(pos, 1)
        sw_tr = np.where(y[tr] == 1, pos_w, 1.0)
        auc, ap, bi = fit_fold(X[tr], y[tr], X[va], y[va], params, sw_tr)
        aucs.append(auc)
        aps.append(ap)
        bests.append(bi)
    return {
        "auc_mean": float(np.nanmean(aucs)),
        "auc_std": float(np.nanstd(aucs)),
        "ap_mean": float(np.nanmean(aps)),
        "ap_std": float(np.nanstd(aps)),
        "best_iter_median": int(np.median(bests)),
    }


def main() -> int:
    X, y, groups, feature_cols = load_feature_frame()

    candidates = build_lgbm_grid() + build_xgb_grid()
    print(f"\nSweeping {len(candidates)} configs (GroupKFold by patient_id)...")

    best = None
    t0 = time.time()
    for idx, params in enumerate(candidates, 1):
        try:
            m = cv_score(X, y, groups, params)
        except Exception as exc:
            print(f"  [{idx}/{len(candidates)}] {params['framework']} FAILED: {exc}")
            continue
        if best is None or m["auc_mean"] > best["m"]["auc_mean"]:
            best = {"params": params, "m": m}
            print(
                f"  [{idx}/{len(candidates)}] NEW BEST {params['framework']}  "
                f"auc {m['auc_mean']:.4f}  ap {m['ap_mean']:.4f}  iter {m['best_iter_median']}"
            )

    assert best is not None
    print(f"\nElapsed: {time.time()-t0:.1f}s")
    print(f"Best ({best['params']['framework']}): {best['params']}")
    print(
        f"  groupkfold  auc {best['m']['auc_mean']:.4f} ± {best['m']['auc_std']:.4f}"
        f"   ap {best['m']['ap_mean']:.4f} ± {best['m']['ap_std']:.4f}"
    )

    # Refit on all data
    pos_w = (y == 0).sum() / max((y == 1).sum(), 1)
    sw_full = np.where(y == 1, pos_w, 1.0)
    n_est = max(200, best["m"]["best_iter_median"])
    if best["params"]["framework"] == "lgbm":
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
        model_type = "LightGBM (binary, class-balanced)"
    else:
        shipped = xgb.XGBClassifier(
            objective="binary:logistic",
            n_estimators=n_est,
            learning_rate=best["params"]["learning_rate"],
            max_depth=best["params"]["max_depth"],
            min_child_weight=best["params"]["min_child_weight"],
            reg_lambda=best["params"]["reg_lambda"],
            reg_alpha=best["params"]["reg_alpha"],
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbosity=0,
            tree_method="hist",
        )
        model_type = "XGBoost (binary, class-balanced)"
    shipped.fit(X, y, sample_weight=sw_full)

    out_model = ARTIFACTS_DIR / "adresso_agitation.joblib"
    joblib.dump(
        {"model": shipped, "features": feature_cols, "framework": best["params"]["framework"]},
        out_model,
        compress=3,
    )
    print(f"\nwrote {out_model} ({out_model.stat().st_size / 1024:.1f} KiB)")

    p_full = shipped.predict_proba(X)[:, 1]
    in_sample_auc = roc_auc_score(y, p_full)

    meta = {
        "task": "binary_classification",
        "target": "Agitation event on this day",
        "classes": ["No agitation", "Agitation"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "missing_value_fill": -1.0,
        "metrics": {
            "groupkfold_auc_mean": best["m"]["auc_mean"],
            "groupkfold_auc_std": best["m"]["auc_std"],
            "groupkfold_ap_mean": best["m"]["ap_mean"],
            "groupkfold_ap_std": best["m"]["ap_std"],
            "in_sample_auc": float(in_sample_auc),
        },
        "training_rows": int(len(X)),
        "positives": int(y.sum()),
        "prevalence": float(y.mean()),
        "model_type": model_type,
        "hyperparameters": {k: v for k, v in best["params"].items() if k != "framework"} | {"n_estimators": n_est},
        "split": "GroupKFold by patient_id",
    }
    (ARTIFACTS_DIR / "adresso_agitation.meta.json").write_text(json.dumps(meta, indent=2))
    public_meta = REPO / "public" / "models" / "adresso_agitation.meta.json"
    if public_meta.parent.exists():
        public_meta.write_text(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
