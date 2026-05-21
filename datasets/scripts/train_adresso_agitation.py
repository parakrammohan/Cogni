"""TIHM1.5 (ADReSSo) per-patient-per-day agitation classifier.

For each (patient, calendar day) we compute a rich feature vector from the
Activity, Sleep, Physiology, and Demographics tables, then label that
(patient, day) as 1 if any Agitation event occurred. The class is heavily
imbalanced — we train a GradientBoostingClassifier with class-balanced
sample weights and report AUC + recall at high precision.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "adresso" / "Dataset"
OUT_DIR = ROOT / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Anchor location set so the feature vector is stable shape across patients
LOCATIONS = [
    "Hallway", "Lounge", "Fridge Door", "Bedroom",
    "Kitchen", "Bathroom", "Front Door", "Back Door",
]


def build_activity_features(activity: pd.DataFrame) -> pd.DataFrame:
    activity = activity.copy()
    activity["day"] = activity["date"].dt.normalize()
    activity["hour"] = activity["date"].dt.hour
    activity["night"] = ((activity["hour"] >= 22) | (activity["hour"] < 6)).astype(int)

    grp = activity.groupby(["patient_id", "day"])
    agg = grp.size().rename("activity_total").to_frame()
    agg["activity_unique_locations"] = grp["location_name"].nunique()
    agg["activity_night_count"] = grp["night"].sum()
    agg["activity_hours_active"] = grp["hour"].nunique()
    agg["activity_first_hour"] = grp["hour"].min()
    agg["activity_last_hour"] = grp["hour"].max()

    # Per-location counts (pivot to wide)
    pivot = (
        activity.groupby(["patient_id", "day", "location_name"]).size().unstack(fill_value=0)
    )
    for loc in LOCATIONS:
        col = f"loc_{loc.lower().replace(' ', '_')}"
        agg[col] = pivot[loc] if loc in pivot.columns else 0

    return agg.reset_index()


def build_physiology_features(phys: pd.DataFrame) -> pd.DataFrame:
    phys = phys.copy()
    phys["day"] = phys["date"].dt.normalize()
    rows = []
    for (pid, day), grp in phys.groupby(["patient_id", "day"]):
        row = {"patient_id": pid, "day": day}
        for dev, sub in grp.groupby("device_type"):
            key = "phys_" + dev.lower().replace(" ", "_").replace("/", "_")
            row[f"{key}_mean"] = sub["value"].mean()
            row[f"{key}_max"] = sub["value"].max()
        rows.append(row)
    if not rows:
        return pd.DataFrame(columns=["patient_id", "day"])
    return pd.DataFrame(rows)


def build_sleep_features(sleep: pd.DataFrame) -> pd.DataFrame:
    sleep = sleep.copy()
    sleep["day"] = sleep["date"].dt.normalize()
    grp = sleep.groupby(["patient_id", "day"])
    out = pd.DataFrame({
        "sleep_samples": grp.size(),
        "sleep_hr_mean": grp["heart_rate"].mean(),
        "sleep_hr_std": grp["heart_rate"].std(),
        "sleep_resp_mean": grp["respiratory_rate"].mean(),
        "sleep_resp_std": grp["respiratory_rate"].std(),
        "sleep_snoring_frac": grp["snoring"].mean(),
        "sleep_awake_frac": grp["state"].apply(lambda s: (s == "AWAKE").mean()),
        "sleep_deep_frac": grp["state"].apply(lambda s: (s == "DEEP").mean()),
        "sleep_rem_frac": grp["state"].apply(lambda s: (s == "REM").mean()),
    }).reset_index()
    return out


def main() -> int:
    print("loading...")
    activity = pd.read_csv(DATASET / "Activity.csv", parse_dates=["date"])
    sleep = pd.read_csv(DATASET / "Sleep.csv", parse_dates=["date"])
    phys = pd.read_csv(DATASET / "Physiology.csv", parse_dates=["date"])
    labels = pd.read_csv(DATASET / "Labels.csv", parse_dates=["date"])
    demo = pd.read_csv(DATASET / "Demographics.csv")

    print(
        f"activity={len(activity):,}  sleep={len(sleep):,}  "
        f"phys={len(phys):,}  labels={len(labels):,}  patients={demo.patient_id.nunique()}"
    )

    # Build (patient, day) feature frame from the union of all tables
    print("\nengineering features...")
    af = build_activity_features(activity)
    pf = build_physiology_features(phys)
    sf = build_sleep_features(sleep)

    # Master frame from activity (highest coverage), left-join others
    df = af.merge(pf, on=["patient_id", "day"], how="left")
    df = df.merge(sf, on=["patient_id", "day"], how="left")

    # Demographics one-hot
    demo = demo.copy()
    demo["age_low"] = demo["age"].astype(str).str.extract(r"\((\d+)").astype(float)
    demo["sex_male"] = (demo["sex"] == "Male").astype(int)
    df = df.merge(demo[["patient_id", "age_low", "sex_male"]], on="patient_id", how="left")

    # Labels: agitation events
    agit = labels[labels["type"] == "Agitation"].copy()
    agit["day"] = agit["date"].dt.normalize()
    agit_set = set(zip(agit["patient_id"], agit["day"]))
    df["target"] = [
        int((p, d) in agit_set) for p, d in zip(df["patient_id"], df["day"])
    ]

    print(
        f"rows={len(df):,}  positives={df['target'].sum()}  "
        f"prevalence={df['target'].mean():.3f}"
    )

    feature_cols = [c for c in df.columns if c not in {"patient_id", "day", "target"}]
    X = df[feature_cols].astype("float64").fillna(-1.0).values
    y = df["target"].values
    groups = df["patient_id"].values
    print(f"features={len(feature_cols)}")

    # Patient-grouped CV — never train and test on the same patient
    cv = GroupKFold(n_splits=5)
    fold_auc, fold_ap = [], []
    for fold, (tr, va) in enumerate(cv.split(X, y, groups), start=1):
        m = GradientBoostingClassifier(
            n_estimators=300, max_depth=3, learning_rate=0.05, random_state=42
        )
        # Class-balanced sample weights
        pos_w = (y[tr] == 0).sum() / max((y[tr] == 1).sum(), 1)
        sw = np.where(y[tr] == 1, pos_w, 1.0)
        m.fit(X[tr], y[tr], sample_weight=sw)
        p = m.predict_proba(X[va])[:, 1]
        try:
            auc = roc_auc_score(y[va], p)
        except ValueError:
            auc = float("nan")
        ap = average_precision_score(y[va], p) if (y[va] == 1).any() else float("nan")
        fold_auc.append(auc)
        fold_ap.append(ap)
        print(f"  fold {fold}: auc={auc:.3f}  ap={ap:.3f}  n_va={len(va)}  pos_va={(y[va]==1).sum()}")

    print(f"\nGroupKFold AUC: {np.nanmean(fold_auc):.3f} ± {np.nanstd(fold_auc):.3f}")
    print(f"GroupKFold AP:  {np.nanmean(fold_ap):.3f} ± {np.nanstd(fold_ap):.3f}")

    # Final fit on all data
    pos_w = (y == 0).sum() / max((y == 1).sum(), 1)
    sw = np.where(y == 1, pos_w, 1.0)
    final = GradientBoostingClassifier(
        n_estimators=400, max_depth=3, learning_rate=0.05, random_state=42
    )
    final.fit(X, y, sample_weight=sw)

    p_full = final.predict_proba(X)[:, 1]
    print(f"\nIn-sample AUC: {roc_auc_score(y, p_full):.3f}")
    yhat = (p_full > 0.5).astype(int)
    print(classification_report(y, yhat, digits=3))
    print(confusion_matrix(y, yhat))

    # ONNX export
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    initial_type = [("input", FloatTensorType([None, len(feature_cols)]))]
    onx = convert_sklearn(
        final,
        initial_types=initial_type,
        target_opset=17,
        options={id(final): {"zipmap": False}},
    )
    onnx_path = OUT_DIR / "adresso_agitation.onnx"
    onnx_path.write_bytes(onx.SerializeToString())
    print(f"wrote {onnx_path} ({onnx_path.stat().st_size / 1024:.1f} KiB)")

    meta = {
        "task": "binary_classification",
        "target": "Agitation event on this day",
        "classes": ["No agitation", "Agitation"],
        "features": feature_cols,
        "feature_count": len(feature_cols),
        "missing_value_fill": -1.0,
        "metrics": {
            "groupkfold_auc_mean": float(np.nanmean(fold_auc)),
            "groupkfold_auc_std": float(np.nanstd(fold_auc)),
            "groupkfold_ap_mean": float(np.nanmean(fold_ap)),
            "groupkfold_ap_std": float(np.nanstd(fold_ap)),
            "in_sample_auc": float(roc_auc_score(y, p_full)),
        },
        "training_rows": int(len(df)),
        "positives": int(df["target"].sum()),
        "prevalence": float(df["target"].mean()),
        "model_type": "GradientBoostingClassifier (class-balanced weights)",
        "split": "GroupKFold by patient_id",
    }
    (OUT_DIR / "adresso_agitation.meta.json").write_text(json.dumps(meta, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
