"""dementia_oasis v4 — engineered features + multi-algo Optuna search.

What's new vs v3:

1. **Engineered features**: brain-volume composites (ASF*eTIV, eTIV/ASF),
   per-subject visit deltas (Δ MMSE, Δ nWBV from the subject's own
   baseline visit), and clinical interactions.
2. **Three algorithms**: LightGBM, XGBoost, CatBoost. Each tuned by
   Optuna (TPE) for 80 trials on GroupKFold-by-subject AUC.
3. **Repeated GroupKFold**: average AUC across 3 seeds × 5 folds so a
   single unlucky split doesn't pick a worse-generalising config.

Honest bar: 373 rows × 150 subjects is fundamentally limited under
subject-aware CV. The v3 GroupKFold AUC of ~0.855 was the ceiling
for simple gradient boosting. Realistic upside here is a few
percentage points.
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path
from typing import Any

import catboost as cb
import joblib
import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
import xgboost as xgb
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import GroupKFold

warnings.filterwarnings("ignore", category=UserWarning)
optuna.logging.set_verbosity(optuna.logging.WARNING)

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "datasets" / "dementia" / "dementia_dataset.csv"
ARTIFACTS_DIR = REPO / "backend" / "app" / "ml" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

RANDOM_STATE = 42
SEEDS = (42, 7, 2026)
N_TRIALS_PER_ALGO = 80


def build_features(df: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray, np.ndarray, list[str]]:
    df = df.copy()
    df.columns = [c.strip().lstrip("﻿") for c in df.columns]
    df["Sex"] = (df["M/F"] == "M").astype(int)
    df["Target"] = (df["Group"] != "Nondemented").astype(int)

    # Brain-volume composites.
    df["ASF_x_eTIV"] = df["ASF"] * df["eTIV"]
    df["eTIV_over_ASF"] = df["eTIV"] / df["ASF"].replace(0, np.nan)
    # Clinical interactions: MMSE decline accelerates with age; SES
    # interacts with education.
    df["MMSE_x_Age"] = df["MMSE"] * df["Age"]
    df["SES_x_EDUC"] = df["SES"] * df["EDUC"]

    # Per-subject visit deltas: today minus this subject's earliest
    # visit. Captures within-subject change which is what OASIS labels.
    df = df.sort_values(["Subject ID", "Visit"]).reset_index(drop=True)
    baseline = df.groupby("Subject ID").first().reset_index()
    baseline_cols = ["MMSE", "nWBV", "eTIV"]
    baseline = baseline[["Subject ID"] + baseline_cols].rename(
        columns={c: f"baseline_{c}" for c in baseline_cols}
    )
    df = df.merge(baseline, on="Subject ID", how="left")
    for c in baseline_cols:
        df[f"delta_{c}"] = df[c] - df[f"baseline_{c}"]

    feature_cols = [
        "Visit", "MR Delay", "Sex", "Age", "EDUC", "SES",
        "MMSE", "eTIV", "nWBV", "ASF",
        "ASF_x_eTIV", "eTIV_over_ASF", "MMSE_x_Age", "SES_x_EDUC",
        "delta_MMSE", "delta_nWBV", "delta_eTIV",
    ]
    X = df[feature_cols].astype("float64")
    y = df["Target"].values
    groups = df["Subject ID"].values
    return X, y, groups, feature_cols


def repeated_groupkfold_auc(fit_predict, X, y, groups) -> float:
    aucs: list[float] = []
    for seed in SEEDS:
        rng = np.random.default_rng(seed)
        uniq = np.array(sorted(set(groups)))
        rng.shuffle(uniq)
        order = {g: i for i, g in enumerate(uniq)}
        group_order = np.array([order[g] for g in groups])
        splitter = GroupKFold(n_splits=5)
        for tr, va in splitter.split(X, y, group_order):
            if not ((y[va] == 1).any() and (y[va] == 0).any()):
                continue
            p = fit_predict(X[tr], y[tr], X[va], y[va])
            aucs.append(roc_auc_score(y[va], p))
    return float(np.mean(aucs))


def make_lgbm_obj(X, y, groups):
    def obj(trial: optuna.Trial) -> float:
        params = {
            "num_leaves": trial.suggest_int("num_leaves", 3, 31),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_samples": trial.suggest_int("min_child_samples", 3, 30),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 5.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 1.0),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "bagging_freq": trial.suggest_int("bagging_freq", 0, 7),
        }

        def fit_predict(Xtr, ytr, Xva, yva):
            imp = SimpleImputer(strategy="median").fit(Xtr)
            clf = lgb.LGBMClassifier(
                objective="binary", n_estimators=2000, **params,
                random_state=RANDOM_STATE, n_jobs=-1, verbosity=-1,
            )
            clf.fit(
                imp.transform(Xtr), ytr,
                eval_set=[(imp.transform(Xva), yva)],
                eval_metric="auc",
                callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)],
            )
            return clf.predict_proba(imp.transform(Xva))[:, 1]

        return repeated_groupkfold_auc(fit_predict, X, y, groups)

    return obj


def make_xgb_obj(X, y, groups):
    def obj(trial: optuna.Trial) -> float:
        params = {
            "max_depth": trial.suggest_int("max_depth", 2, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 20),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 8.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 2.0),
            "subsample": trial.suggest_float("subsample", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "gamma": trial.suggest_float("gamma", 0.0, 1.0),
        }

        def fit_predict(Xtr, ytr, Xva, yva):
            imp = SimpleImputer(strategy="median").fit(Xtr)
            clf = xgb.XGBClassifier(
                objective="binary:logistic", n_estimators=2000, **params,
                random_state=RANDOM_STATE, n_jobs=-1, verbosity=0,
                eval_metric="auc", early_stopping_rounds=50, tree_method="hist",
            )
            clf.fit(imp.transform(Xtr), ytr, eval_set=[(imp.transform(Xva), yva)], verbose=False)
            return clf.predict_proba(imp.transform(Xva))[:, 1]

        return repeated_groupkfold_auc(fit_predict, X, y, groups)

    return obj


def make_cb_obj(X, y, groups):
    def obj(trial: optuna.Trial) -> float:
        params = {
            "depth": trial.suggest_int("depth", 3, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1.0, 12.0),
            "bagging_temperature": trial.suggest_float("bagging_temperature", 0.0, 2.0),
            "border_count": trial.suggest_int("border_count", 32, 254),
            "random_strength": trial.suggest_float("random_strength", 0.0, 5.0),
        }

        def fit_predict(Xtr, ytr, Xva, yva):
            imp = SimpleImputer(strategy="median").fit(Xtr)
            clf = cb.CatBoostClassifier(
                iterations=2000, loss_function="Logloss", eval_metric="AUC",
                early_stopping_rounds=50, verbose=False, random_seed=RANDOM_STATE,
                allow_writing_files=False, **params,
            )
            clf.fit(imp.transform(Xtr), ytr, eval_set=(imp.transform(Xva), yva), verbose=False)
            return clf.predict_proba(imp.transform(Xva))[:, 1]

        return repeated_groupkfold_auc(fit_predict, X, y, groups)

    return obj


def fit_final(algo: str, params: dict[str, Any], X, y):
    imp = SimpleImputer(strategy="median").fit(X)
    X_full = imp.transform(X)
    if algo == "lgbm":
        model = lgb.LGBMClassifier(
            objective="binary", n_estimators=400, **params,
            random_state=RANDOM_STATE, n_jobs=-1, verbosity=-1,
        )
    elif algo == "xgb":
        model = xgb.XGBClassifier(
            objective="binary:logistic", n_estimators=400, **params,
            random_state=RANDOM_STATE, n_jobs=-1, verbosity=0, tree_method="hist",
        )
    else:
        model = cb.CatBoostClassifier(
            iterations=400, loss_function="Logloss", verbose=False,
            random_seed=RANDOM_STATE, allow_writing_files=False, **params,
        )
    model.fit(X_full, y)
    return model, imp


def main() -> int:
    df = pd.read_csv(CSV)
    print(f"loaded {len(df)} rows, {df['Subject ID'].nunique() if 'Subject ID' in df.columns else '?'} subjects")
    X_df, y, groups, feature_cols = build_features(df)
    X = X_df.values
    print(f"features: {len(feature_cols)}; class balance {np.bincount(y).tolist()}")

    studies: dict[str, optuna.Study] = {}
    for algo, factory in [
        ("lgbm", make_lgbm_obj),
        ("xgb", make_xgb_obj),
        ("catboost", make_cb_obj),
    ]:
        print(f"\n=== Optuna search: {algo} ({N_TRIALS_PER_ALGO} trials) ===", flush=True)
        study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(seed=RANDOM_STATE),
        )
        study.optimize(factory(X, y, groups), n_trials=N_TRIALS_PER_ALGO, show_progress_bar=False)
        print(f"  best AUC {study.best_value:.4f}  params {study.best_params}", flush=True)
        studies[algo] = study

    best_algo = max(studies, key=lambda a: studies[a].best_value)
    best_params = studies[best_algo].best_params
    best_auc = studies[best_algo].best_value
    print(f"\nWINNER: {best_algo}  GroupKFold AUC {best_auc:.4f}")

    model, imp = fit_final(best_algo, best_params, X, y)
    p_full = model.predict_proba(imp.transform(X))[:, 1]
    acc_full = accuracy_score(y, (p_full > 0.5).astype(int))
    print(f"In-sample acc {acc_full:.4f} (not a generalisation estimate)")

    out_model = ARTIFACTS_DIR / "dementia_oasis.joblib"
    joblib.dump(
        {"model": model, "imputer": imp, "features": feature_cols, "framework": best_algo},
        out_model, compress=3,
    )
    print(f"\nwrote {out_model} ({out_model.stat().st_size / 1024:.1f} KiB)")

    imputation_values = {col: float(v) for col, v in zip(feature_cols, imp.statistics_)}
    meta = {
        "task": "binary_classification",
        "target": "Demented or Converted (vs Nondemented)",
        "classes": ["Nondemented", "Demented/Converted"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "imputation": "median",
        "imputation_values": imputation_values,
        "metrics": {
            "groupkfold_auc_mean": best_auc,
            "groupkfold_auc_seeds": list(SEEDS),
            "lgbm_best_auc": studies["lgbm"].best_value,
            "xgb_best_auc": studies["xgb"].best_value,
            "catboost_best_auc": studies["catboost"].best_value,
        },
        "training_rows": int(len(X)),
        "training_subjects": int(pd.Series(groups).nunique()),
        "model_type": {
            "lgbm": "LightGBM (binary, gradient boosted trees)",
            "xgb": "XGBoost (binary, gradient boosted trees)",
            "catboost": "CatBoost (binary, gradient boosted trees)",
        }[best_algo],
        "hyperparameters": best_params,
        "feature_engineering": [
            "ASF_x_eTIV, eTIV_over_ASF — brain-volume composites",
            "MMSE_x_Age, SES_x_EDUC — clinical interactions",
            "delta_MMSE, delta_nWBV, delta_eTIV — per-subject deltas from baseline visit",
        ],
        "selection": "Optuna TPE, 80 trials per algo, 3-seed x 5-fold GroupKFold-by-subject",
    }
    (ARTIFACTS_DIR / "dementia_oasis.meta.json").write_text(json.dumps(meta, indent=2))
    public_meta = REPO / "public" / "models" / "dementia_oasis.meta.json"
    if public_meta.parent.exists():
        public_meta.write_text(json.dumps(meta, indent=2))
    print(f"wrote {ARTIFACTS_DIR / 'dementia_oasis.meta.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
