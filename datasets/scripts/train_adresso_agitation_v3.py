"""adresso_agitation v3 — lag/baseline features + Optuna over LGBM/XGB/CatBoost.

What's new vs v2:

1. **Lag features**: yesterday's, 3-day rolling mean, 7-day rolling
   mean for every activity / physiology / sleep aggregate.
2. **Patient-baseline deltas**: today's value minus this patient's own
   7-day rolling median — separates within-patient anomalies from
   between-patient variance, which is what an agitation event is.
3. **Time features**: day-of-week, day-of-month modulo trends.
4. **Three algorithms** (LightGBM, XGBoost, CatBoost) each tuned by
   Optuna TPE on GroupKFold-by-patient AUC.
5. **scale_pos_weight / is_unbalance / DART** tried in the LGBM/XGB
   trial space; CatBoost uses class weights.

Bar: v2 hit GroupKFold AUC 0.880. Hoping the lag + baseline features
move it past 0.90; honest data ceiling depends on how predictive the
last few days of physiology really are.
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
import optuna
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold

warnings.filterwarnings("ignore", category=UserWarning)
optuna.logging.set_verbosity(optuna.logging.WARNING)

REPO = Path(__file__).resolve().parents[2]
SCRIPT_V1 = REPO / "datasets" / "scripts" / "train_adresso_agitation.py"
DATASET = REPO / "datasets" / "adresso" / "Dataset"
ARTIFACTS_DIR = REPO / "backend" / "app" / "ml" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

# Reuse v1 feature builders.
spec = importlib.util.spec_from_file_location("adresso_v1", SCRIPT_V1)
assert spec is not None and spec.loader is not None
v1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v1)
build_activity_features = v1.build_activity_features
build_physiology_features = v1.build_physiology_features
build_sleep_features = v1.build_sleep_features

RANDOM_STATE = 42
N_TRIALS_PER_ALGO = 60  # adresso fits slower than dementia, fewer trials


def build_features() -> tuple[pd.DataFrame, np.ndarray, np.ndarray, list[str]]:
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

    df = df.sort_values(["patient_id", "day"]).reset_index(drop=True)

    # Columns we want lag/rolling/baseline features on. Skip categorical
    # location-fraction columns since they're already sparse.
    numeric_cols = [
        c for c in df.columns
        if c not in {"patient_id", "day", "age_low", "sex_male"}
        and df[c].dtype.kind in "fi"
    ]

    # ---- Lag features (yesterday's value) ----
    lag1 = df.groupby("patient_id")[numeric_cols].shift(1)
    lag1.columns = [f"{c}_lag1" for c in lag1.columns]

    # ---- Rolling 3-day mean (excludes today; uses previous 3 days) ----
    roll3 = (
        df.groupby("patient_id")[numeric_cols]
        .rolling(window=3, min_periods=1)
        .mean()
        .shift(1)
        .reset_index(level=0, drop=True)
    )
    roll3.columns = [f"{c}_roll3" for c in roll3.columns]

    # ---- Patient-baseline deltas: today minus this patient's median
    #      over the previous 7 days. Captures within-patient anomaly. ----
    roll7_median = (
        df.groupby("patient_id")[numeric_cols]
        .rolling(window=7, min_periods=2)
        .median()
        .shift(1)
        .reset_index(level=0, drop=True)
    )
    delta = df[numeric_cols].values - roll7_median.values
    delta_df = pd.DataFrame(delta, columns=[f"{c}_delta7" for c in numeric_cols], index=df.index)

    df = pd.concat([df, lag1, roll3, delta_df], axis=1)

    # Time features.
    df["dow"] = df["day"].dt.dayofweek.astype(float)
    df["dom"] = df["day"].dt.day.astype(float)

    # Target.
    agit = labels[labels["type"] == "Agitation"].copy()
    agit["day"] = agit["date"].dt.normalize()
    agit_set = set(zip(agit["patient_id"], agit["day"]))
    df["target"] = [int((p, d) in agit_set) for p, d in zip(df["patient_id"], df["day"])]

    feature_cols = [c for c in df.columns if c not in {"patient_id", "day", "target"}]
    X = df[feature_cols].astype("float64").fillna(-1.0)
    y = df["target"].values
    groups = df["patient_id"].values
    print(
        f"rows={len(df):,}  positives={int(y.sum())}  prevalence={y.mean():.3f}  "
        f"patients={pd.Series(groups).nunique()}  features={len(feature_cols)}",
        flush=True,
    )
    return X, y, groups, feature_cols


def groupkfold_auc(fit_predict, X, y, groups) -> float:
    aucs: list[float] = []
    splitter = GroupKFold(n_splits=5)
    for tr, va in splitter.split(X, y, groups):
        if not ((y[va] == 1).any() and (y[va] == 0).any()):
            continue
        p = fit_predict(X[tr], y[tr], X[va], y[va])
        aucs.append(roc_auc_score(y[va], p))
    return float(np.mean(aucs))


def class_balanced_weights(y: np.ndarray) -> np.ndarray:
    pos = (y == 1).sum()
    neg = (y == 0).sum()
    pos_w = neg / max(pos, 1)
    return np.where(y == 1, pos_w, 1.0)


def make_lgbm_obj(X, y, groups):
    def obj(trial: optuna.Trial) -> float:
        boosting = trial.suggest_categorical("boosting_type", ["gbdt", "dart"])
        params: dict[str, Any] = {
            "boosting_type": boosting,
            "num_leaves": trial.suggest_int("num_leaves", 7, 63),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_samples": trial.suggest_int("min_child_samples", 5, 60),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 5.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 2.0),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "bagging_freq": trial.suggest_int("bagging_freq", 0, 7),
            "is_unbalance": trial.suggest_categorical("is_unbalance", [True, False]),
        }

        def fit_predict(Xtr, ytr, Xva, yva):
            sw = None if params["is_unbalance"] else class_balanced_weights(ytr)
            clf = lgb.LGBMClassifier(
                objective="binary", n_estimators=600 if boosting == "dart" else 2000,
                **params, random_state=RANDOM_STATE, n_jobs=-1, verbosity=-1,
            )
            if boosting == "gbdt":
                clf.fit(
                    Xtr, ytr, sample_weight=sw,
                    eval_set=[(Xva, yva)], eval_metric="auc",
                    callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)],
                )
            else:
                # DART doesn't support early stopping reliably.
                clf.fit(Xtr, ytr, sample_weight=sw)
            return clf.predict_proba(Xva)[:, 1]

        return groupkfold_auc(fit_predict, X, y, groups)

    return obj


def make_xgb_obj(X, y, groups):
    def obj(trial: optuna.Trial) -> float:
        # Sweep scale_pos_weight in [1, 30] alongside hyperparams.
        spw = trial.suggest_float("scale_pos_weight", 1.0, 30.0, log=True)
        params: dict[str, Any] = {
            "max_depth": trial.suggest_int("max_depth", 2, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 30),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.0, 8.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 2.0),
            "subsample": trial.suggest_float("subsample", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "gamma": trial.suggest_float("gamma", 0.0, 1.0),
            "scale_pos_weight": spw,
        }

        def fit_predict(Xtr, ytr, Xva, yva):
            clf = xgb.XGBClassifier(
                objective="binary:logistic", n_estimators=2000, **params,
                random_state=RANDOM_STATE, n_jobs=-1, verbosity=0,
                eval_metric="auc", early_stopping_rounds=50, tree_method="hist",
            )
            clf.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)
            return clf.predict_proba(Xva)[:, 1]

        return groupkfold_auc(fit_predict, X, y, groups)

    return obj


def make_cb_obj(X, y, groups):
    def obj(trial: optuna.Trial) -> float:
        params: dict[str, Any] = {
            "depth": trial.suggest_int("depth", 3, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1.0, 12.0),
            "bagging_temperature": trial.suggest_float("bagging_temperature", 0.0, 2.0),
            "border_count": trial.suggest_int("border_count", 32, 254),
            "random_strength": trial.suggest_float("random_strength", 0.0, 5.0),
        }
        auto_class_weights = trial.suggest_categorical(
            "auto_class_weights", ["Balanced", "SqrtBalanced", None]
        )

        def fit_predict(Xtr, ytr, Xva, yva):
            cb_params = dict(params)
            if auto_class_weights is not None:
                cb_params["auto_class_weights"] = auto_class_weights
            clf = cb.CatBoostClassifier(
                iterations=2000, loss_function="Logloss", eval_metric="AUC",
                early_stopping_rounds=50, verbose=False, random_seed=RANDOM_STATE,
                allow_writing_files=False, **cb_params,
            )
            clf.fit(Xtr, ytr, eval_set=(Xva, yva), verbose=False)
            return clf.predict_proba(Xva)[:, 1]

        return groupkfold_auc(fit_predict, X, y, groups)

    return obj


def fit_final(algo: str, params: dict[str, Any], X, y):
    if algo == "lgbm":
        boosting = params.get("boosting_type", "gbdt")
        sw = None if params.get("is_unbalance") else class_balanced_weights(y)
        model = lgb.LGBMClassifier(
            objective="binary",
            n_estimators=400 if boosting == "dart" else 600,
            **params, random_state=RANDOM_STATE, n_jobs=-1, verbosity=-1,
        )
        model.fit(X, y, sample_weight=sw)
    elif algo == "xgb":
        model = xgb.XGBClassifier(
            objective="binary:logistic", n_estimators=400, **params,
            random_state=RANDOM_STATE, n_jobs=-1, verbosity=0, tree_method="hist",
        )
        model.fit(X, y)
    else:
        cb_params = {k: v for k, v in params.items() if v is not None}
        model = cb.CatBoostClassifier(
            iterations=400, loss_function="Logloss",
            verbose=False, random_seed=RANDOM_STATE,
            allow_writing_files=False, **cb_params,
        )
        model.fit(X, y)
    return model


def main() -> int:
    X_df, y, groups, feature_cols = build_features()
    X = X_df.values

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

    model = fit_final(best_algo, best_params, X, y)
    p_full = model.predict_proba(X)[:, 1]
    ap_full = average_precision_score(y, p_full)
    print(f"In-sample AP {ap_full:.4f} (not a generalisation estimate)")

    out_model = ARTIFACTS_DIR / "adresso_agitation.joblib"
    joblib.dump(
        {"model": model, "features": feature_cols, "framework": best_algo},
        out_model, compress=3,
    )
    print(f"\nwrote {out_model} ({out_model.stat().st_size / 1024:.1f} KiB)")

    meta = {
        "task": "binary_classification",
        "target": "Agitation event on this day",
        "classes": ["No agitation", "Agitation"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "missing_value_fill": -1.0,
        "metrics": {
            "groupkfold_auc_mean": best_auc,
            "lgbm_best_auc": studies["lgbm"].best_value,
            "xgb_best_auc": studies["xgb"].best_value,
            "catboost_best_auc": studies["catboost"].best_value,
            "in_sample_ap": float(ap_full),
        },
        "training_rows": int(len(X)),
        "positives": int(y.sum()),
        "prevalence": float(y.mean()),
        "model_type": {
            "lgbm": "LightGBM (binary, class-balanced)",
            "xgb": "XGBoost (binary, class-balanced)",
            "catboost": "CatBoost (binary, class-balanced)",
        }[best_algo],
        "hyperparameters": best_params,
        "feature_engineering": [
            "lag1: yesterday's value of every numeric daily aggregate",
            "roll3: 3-day rolling mean (shifted) of every numeric column",
            "delta7: today minus this patient's 7-day median (within-patient anomaly)",
            "dow / dom: day-of-week / day-of-month time features",
        ],
        "selection": "Optuna TPE, 60 trials per algo, 5-fold GroupKFold by patient_id",
        "split": "GroupKFold by patient_id",
    }
    (ARTIFACTS_DIR / "adresso_agitation.meta.json").write_text(json.dumps(meta, indent=2))
    public_meta = REPO / "public" / "models" / "adresso_agitation.meta.json"
    if public_meta.parent.exists():
        public_meta.write_text(json.dumps(meta, indent=2))
    print(f"wrote {ARTIFACTS_DIR / 'adresso_agitation.meta.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
