"""alzheimer_mri v2 — bake off CNN backbones on GPU, ship the best.

What it does
============

1. Loads the 4-class brain-MRI corpus at
   `datasets/alzheimer_mri/combined_images/{class}/*.jpg`.
2. Fine-tunes a list of `timm` backbones from ImageNet weights on
   this dataset. Default bake-off:
     mobilenetv3_small_100, mobilenetv3_large_100, resnet18,
     efficientnet_b0, efficientnet_b2, convnext_tiny, resnet50.
3. Tracks accuracy / macro-F1 / per-class precision-recall / AUC on
   the same held-out validation split for every candidate.
4. Picks the single best architecture by macro-F1 (ties broken by
   accuracy), exports it to:
     - `backend/app/ml/artifacts/alzheimer_mri.onnx` (replaces the
       current sklearn-MLP ONNX),
     - `backend/app/ml/artifacts/alzheimer_mri.meta.json` (new
       input_shape, preprocess steps, full metric table).
5. Writes a `mri_bakeoff_log.json` next to the artifact with every
   candidate's full numbers for the bake-off audit trail.

Why ONNX
========
Inference runs on HF Space's CPU-only Docker image. Training in
PyTorch + GPU and serving via ONNX keeps the runtime container at
~50 MiB of onnxruntime instead of bundling ~700 MiB of PyTorch CPU
wheels (or ~3 GiB if it tried to pull CUDA wheels). ONNX runtime's
optimised CPU kernels are also faster than PyTorch eager mode for a
typical CNN forward pass on commodity CPU.

Constraints respected
=====================
- Single architecture wins — no stacking / ensembling.
- Image-level CV only. The Kaggle "combined_images" dataset augments
  the same underlying patient slices many times and ships no patient
  IDs, so a GroupKFold isn't possible. The meta's `caveats` field
  spells this out so the screening popover keeps the warning.

Run
===
    pip install torch torchvision timm onnx onnxruntime pillow \
                scikit-learn pandas tqdm
    python datasets/scripts/train_alzheimer_mri_v2.py \
        --data-dir datasets/alzheimer_mri/combined_images \
        --epochs 20 --batch-size 64 --img-size 224

CLI flags
---------
--data-dir       Root with one folder per class.
--output-dir     Where to write the winning artifacts (defaults to
                 backend/app/ml/artifacts).
--models         Comma-separated timm model names to compare.
--epochs         Max epochs per candidate (early stopping cuts short).
--patience       Early-stopping patience on val macro-F1.
--batch-size     Per-GPU batch size.
--img-size       Square input edge. 224 (default) works for every
                 default backbone; EfficientNet-B2 likes 260 but
                 trains fine at 224 too.
--seed           Reproducibility.
--num-workers    DataLoader workers.
--no-export      Skip the final ONNX export (useful when sweeping
                 without overwriting the live artefact).
"""

from __future__ import annotations

import argparse
import copy
import dataclasses
import gc
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

# ----------------------------------------------------------------- Defaults

DEFAULT_MODELS = [
    "mobilenetv3_small_100",
    "mobilenetv3_large_100",
    "resnet18",
    "efficientnet_b0",
    "efficientnet_b2",
    "convnext_tiny",
    "resnet50",
]

# Class order is fixed by sorting folder names — alphabetical matches
# the existing meta and the front-end's `meta.classes` lookup.
CLASS_ORDER = ["MildDemented", "ModerateDemented", "NonDemented", "VeryMildDemented"]

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


# ----------------------------------------------------------------- Reproducibility

def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


# ----------------------------------------------------------------- Dataset

class MriFolder(Dataset):
    """Reads `{class}/*.jpg` from a folder. Grayscale brain MRIs are
    expanded to 3 channels so ImageNet-pretrained backbones see the
    distribution they expect."""

    def __init__(self, files: list[tuple[Path, int]], transform) -> None:
        self.files = files
        self.transform = transform

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int):
        path, label = self.files[idx]
        img = Image.open(path).convert("RGB")
        return self.transform(img), label


def discover_files(data_dir: Path) -> list[tuple[Path, int]]:
    out: list[tuple[Path, int]] = []
    for cls_idx, cls_name in enumerate(CLASS_ORDER):
        folder = data_dir / cls_name
        if not folder.is_dir():
            raise SystemExit(f"Missing class folder: {folder}")
        for p in sorted(folder.iterdir()):
            if p.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                out.append((p, cls_idx))
    if not out:
        raise SystemExit(f"No images found under {data_dir}")
    return out


def stratified_split(
    files: list[tuple[Path, int]], val_frac: float, seed: int
) -> tuple[list, list]:
    rng = np.random.default_rng(seed)
    train, val = [], []
    by_label: dict[int, list] = {}
    for f in files:
        by_label.setdefault(f[1], []).append(f)
    for _label, group in by_label.items():
        idx = np.arange(len(group))
        rng.shuffle(idx)
        n_val = int(round(len(group) * val_frac))
        v = {int(i) for i in idx[:n_val]}
        for i, item in enumerate(group):
            (val if i in v else train).append(item)
    rng.shuffle(train)
    rng.shuffle(val)
    return train, val


def build_transforms(img_size: int):
    train_tf = transforms.Compose([
        transforms.Resize((img_size + 16, img_size + 16)),
        transforms.RandomCrop(img_size),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return train_tf, eval_tf


# ----------------------------------------------------------------- Training

@dataclasses.dataclass
class TrainResult:
    model_name: str
    val_accuracy: float
    val_macro_f1: float
    val_auc_macro_ovr: float
    per_class_precision: list[float]
    per_class_recall: list[float]
    per_class_f1: list[float]
    confusion: list[list[int]]
    best_epoch: int
    epochs_trained: int
    train_seconds: float


def build_model(name: str, num_classes: int):
    import timm
    return timm.create_model(name, pretrained=True, num_classes=num_classes)


def train_one(
    name: str,
    train_loader: DataLoader,
    val_loader: DataLoader,
    *,
    epochs: int,
    patience: int,
    lr: float,
    weight_decay: float,
    device: torch.device,
) -> tuple[TrainResult, nn.Module]:
    print(f"\n=== {name} ===", flush=True)
    model = build_model(name, num_classes=len(CLASS_ORDER)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")

    best_macro_f1 = -1.0
    best_state = None
    best_epoch = 0
    no_improve = 0
    best_metrics: TrainResult | None = None
    last_epoch = 0
    t0 = time.time()

    for epoch in range(1, epochs + 1):
        last_epoch = epoch
        model.train(True)
        running, n = 0.0, 0
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda", enabled=device.type == "cuda"):
                out = model(x)
                loss = loss_fn(out, y)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            running += loss.item() * x.size(0)
            n += x.size(0)
        scheduler.step()

        # ---- Eval pass ----
        model.train(False)
        y_true, y_prob = [], []
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device, non_blocking=True)
                with torch.amp.autocast("cuda", enabled=device.type == "cuda"):
                    logits = model(x)
                probs = torch.softmax(logits.float(), dim=1)
                y_true.append(y.numpy())
                y_prob.append(probs.cpu().numpy())
        y_true = np.concatenate(y_true)
        y_prob = np.concatenate(y_prob)
        y_pred = y_prob.argmax(axis=1)

        acc = accuracy_score(y_true, y_pred)
        macro_f1 = f1_score(y_true, y_pred, average="macro")
        try:
            auc = roc_auc_score(y_true, y_prob, multi_class="ovr", average="macro")
        except Exception:
            auc = float("nan")

        train_loss = running / max(n, 1)
        print(
            f"  ep {epoch:02d}  train_loss {train_loss:.4f}  val_acc {acc:.4f}  "
            f"val_macroF1 {macro_f1:.4f}  val_AUC_ovr {auc:.4f}",
            flush=True,
        )

        if macro_f1 > best_macro_f1:
            best_macro_f1 = macro_f1
            best_epoch = epoch
            best_state = copy.deepcopy(model.state_dict())
            report = classification_report(
                y_true,
                y_pred,
                target_names=CLASS_ORDER,
                output_dict=True,
                zero_division=0,
            )
            best_metrics = TrainResult(
                model_name=name,
                val_accuracy=float(acc),
                val_macro_f1=float(macro_f1),
                val_auc_macro_ovr=float(auc) if not np.isnan(auc) else float("nan"),
                per_class_precision=[float(report[c]["precision"]) for c in CLASS_ORDER],
                per_class_recall=[float(report[c]["recall"]) for c in CLASS_ORDER],
                per_class_f1=[float(report[c]["f1-score"]) for c in CLASS_ORDER],
                confusion=confusion_matrix(y_true, y_pred).tolist(),
                best_epoch=epoch,
                epochs_trained=epoch,
                train_seconds=time.time() - t0,
            )
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                print(f"  -> early stop (no macro-F1 gain for {patience} epochs)", flush=True)
                break

    assert best_state is not None and best_metrics is not None
    model.load_state_dict(best_state)
    best_metrics.epochs_trained = last_epoch
    return best_metrics, model


# ----------------------------------------------------------------- ONNX export

def export_onnx(model: nn.Module, img_size: int, out_path: Path) -> None:
    model.train(False)
    dummy = torch.randn(1, 3, img_size, img_size)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model.cpu(),
        dummy,
        str(out_path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )
    print(f"wrote ONNX -> {out_path} ({out_path.stat().st_size / 1024:.1f} KiB)")


# ----------------------------------------------------------------- Main

def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=repo / "datasets" / "alzheimer_mri" / "combined_images",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo / "backend" / "app" / "ml" / "artifacts",
    )
    parser.add_argument(
        "--models",
        type=str,
        default=",".join(DEFAULT_MODELS),
        help="Comma-separated timm model names.",
    )
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--patience", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--val-frac", type=float, default=0.2)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--no-export",
        action="store_true",
        help="Skip writing the ONNX + meta.json overwrite at the end.",
    )
    args = parser.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}  models: {args.models}")
    if device.type != "cuda":
        print("WARNING: no CUDA detected, this will be very slow.", file=sys.stderr)

    # Data
    files = discover_files(args.data_dir)
    print(f"loaded {len(files):,} images across {len(CLASS_ORDER)} classes")
    train_files, val_files = stratified_split(files, args.val_frac, args.seed)
    print(f"train {len(train_files):,}   val {len(val_files):,}")
    train_tf, eval_tf = build_transforms(args.img_size)
    train_loader = DataLoader(
        MriFolder(train_files, train_tf),
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=device.type == "cuda",
        drop_last=True,
    )
    val_loader = DataLoader(
        MriFolder(val_files, eval_tf),
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=device.type == "cuda",
    )

    model_names = [m.strip() for m in args.models.split(",") if m.strip()]
    results: list[TrainResult] = []
    best_so_far: tuple[TrainResult, nn.Module] | None = None
    for name in model_names:
        try:
            res, model = train_one(
                name,
                train_loader,
                val_loader,
                epochs=args.epochs,
                patience=args.patience,
                lr=args.lr,
                weight_decay=args.weight_decay,
                device=device,
            )
        except Exception as exc:
            print(f"  -> {name} FAILED: {exc}", flush=True)
            continue
        results.append(res)
        if best_so_far is None or res.val_macro_f1 > best_so_far[0].val_macro_f1:
            best_so_far = (res, model)
        # Free CUDA memory between candidates.
        del model
        gc.collect()
        if device.type == "cuda":
            torch.cuda.empty_cache()

    if not results:
        print("No model trained successfully.", file=sys.stderr)
        return 1

    # ---- Summary ----
    print("\n========== Bake-off summary ==========")
    print(f"{'model':28s}  {'acc':>6s}  {'macroF1':>8s}  {'AUC_ovr':>8s}  {'epochs':>6s}  {'time(s)':>7s}")
    for r in results:
        print(
            f"{r.model_name:28s}  {r.val_accuracy:6.4f}  {r.val_macro_f1:8.4f}  "
            f"{r.val_auc_macro_ovr:8.4f}  {r.epochs_trained:6d}  {r.train_seconds:7.0f}"
        )

    assert best_so_far is not None
    winner_res, winner_model = best_so_far
    print(f"\nWINNER: {winner_res.model_name}  macroF1 {winner_res.val_macro_f1:.4f}")

    # ---- Audit log ----
    audit = {
        "candidates": [dataclasses.asdict(r) for r in results],
        "winner": dataclasses.asdict(winner_res),
        "args": {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "mri_bakeoff_log.json").write_text(json.dumps(audit, indent=2))
    print(f"audit -> {args.output_dir / 'mri_bakeoff_log.json'}")

    if args.no_export:
        print("--no-export set; skipping ONNX + meta overwrite.")
        return 0

    # ---- Export winner ----
    onnx_path = args.output_dir / "alzheimer_mri.onnx"
    export_onnx(winner_model, args.img_size, onnx_path)

    meta = {
        "task": "multiclass_classification",
        "classes": CLASS_ORDER,
        "input_shape": [args.img_size, args.img_size, 3],
        "input_layout": "NCHW RGB normalised with ImageNet mean/std (0-1 range)",
        "preprocess_steps": [
            f"convert to RGB and resize to {args.img_size}x{args.img_size}",
            "divide by 255",
            "subtract ImageNet mean (0.485, 0.456, 0.406)",
            "divide by ImageNet std (0.229, 0.224, 0.225)",
            "transpose to NCHW",
        ],
        "metrics": {
            "test_accuracy": winner_res.val_accuracy,
            "macro_f1": winner_res.val_macro_f1,
            "auc_macro_ovr": winner_res.val_auc_macro_ovr,
            "per_class_precision": {
                c: p for c, p in zip(CLASS_ORDER, winner_res.per_class_precision)
            },
            "per_class_recall": {
                c: r for c, r in zip(CLASS_ORDER, winner_res.per_class_recall)
            },
            "per_class_f1": {
                c: f for c, f in zip(CLASS_ORDER, winner_res.per_class_f1)
            },
            "confusion_matrix_rows_true_cols_pred": winner_res.confusion,
            "train_size": len(files) - len(val_files),
            "test_size": len(val_files),
        },
        "model_type": f"{winner_res.model_name} (timm, ImageNet pretrained, fine-tuned)",
        "training": {
            "epochs_trained": winner_res.epochs_trained,
            "best_epoch": winner_res.best_epoch,
            "img_size": args.img_size,
            "batch_size": args.batch_size,
            "lr": args.lr,
            "weight_decay": args.weight_decay,
        },
        "caveats": [
            "The Kaggle combined_images set augments the same underlying patient slices many times; image-level train/val splits leak between sets. Reported accuracy overstates clinical performance on truly unseen patients. Treat as a demo, not a diagnostic claim.",
            "Brain MRI scans are not what this app's webcam captures - this model is only useful as an 'upload an MRI' demo flow, not passive monitoring.",
        ],
    }
    meta_path = args.output_dir / "alzheimer_mri.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"wrote meta -> {meta_path}")

    # Mirror the meta into public/models so the frontend's metadata
    # loader (which fetches from /models/<key>.meta.json in dev) stays
    # consistent.
    public_meta = repo / "public" / "models" / "alzheimer_mri.meta.json"
    if public_meta.parent.exists():
        public_meta.write_text(json.dumps(meta, indent=2))
        print(f"wrote meta -> {public_meta}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
