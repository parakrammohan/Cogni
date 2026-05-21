"""alzheimer_mri v2 — multi-GPU bake-off of timm CNN backbones.

Trains a list of `timm` backbones (default 7) on the 4-class brain-MRI
corpus, fans them out across every available CUDA device in parallel,
picks the best by validation macro-F1, and exports the winner to ONNX
so a CPU-only FastAPI backend can serve it.

Two modes
=========

1. **Orchestrator (default).** Discovers GPUs (or honours `--gpus`),
   spawns one subprocess per GPU pinned via `CUDA_VISIBLE_DEVICES`,
   each subprocess runs ONE model in `--single-model` mode. As each
   finishes, the next queued model starts on the freed GPU. With 7
   models and 4 GPUs you get ~2 sequential slots on each card, total
   wall time ≈ max(per-model time) × 2 instead of summed.

2. **Single-model worker (`--single-model NAME`).** Trains exactly
   one architecture, writes `out/logs/<NAME>.log`, saves the best
   weights to `out/weights/<NAME>.pt`, and writes
   `out/results/<NAME>.json` with the full metric block. The
   orchestrator never imports torch in its own process — it just
   reads these JSON files when each child finishes.

Why this design
===============
- `CUDA_VISIBLE_DEVICES` has to be set *before* any torch import to
  actually pin a process to a GPU. The subprocess approach gives every
  worker a fresh interpreter with that env in place, no
  `multiprocessing` start-method headaches.
- Per-model log files keep stdout from 4 concurrent runs from
  interleaving. The top-level `bakeoff.log` has just the summary
  lines so a human can skim it.

Why ONNX
========
Backend runs on HF Space `cpu-basic` with `onnxruntime` already in
requirements. Shipping PyTorch CPU wheels would add ~700 MiB to the
Docker image and slow CPU inference. ONNX is the production-deploy
format; PyTorch is the training format.

Data caveat
===========
Kaggle "combined_images" augments the same underlying patient slices
many times with no patient IDs, so image-level train/val splits leak
between sets. The meta carries this caveat into the UI's "How well
does it work?" popover.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# NOTE: torch / numpy / sklearn imports are deferred to inside the
# worker function. The orchestrator process must not import torch
# before forking children, otherwise CUDA_VISIBLE_DEVICES in the child
# env may be ignored (CUDA driver gets initialised in the parent).

DEFAULT_MODELS = [
    "mobilenetv3_small_100",
    "mobilenetv3_large_100",
    "resnet18",
    "efficientnet_b0",
    "efficientnet_b2",
    "convnext_tiny",
    "resnet50",
]

CLASS_ORDER = ["MildDemented", "ModerateDemented", "NonDemented", "VeryMildDemented"]

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


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
    weights_path: str


# ============================================================ Worker

def run_single_model(args: argparse.Namespace) -> int:
    """Train exactly ONE timm backbone. Called via `--single-model`.

    Writes:
      - out/logs/<NAME>.log         (this file is just where stdout is
                                     teed by the orchestrator subprocess,
                                     not opened directly here)
      - out/weights/<NAME>.pt       (state_dict at best val macro-F1)
      - out/results/<NAME>.json     (TrainResult as JSON)

    All progress prints go to stdout — the orchestrator subprocess
    captures them into the per-model log.
    """
    import copy
    import random
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
    import timm

    name = args.single_model
    output_dir: Path = args.output_dir
    weights_dir = output_dir / "weights"
    results_dir = output_dir / "results"
    weights_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)

    # ---- reproducibility ----
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type != "cuda":
        print("WARNING: no CUDA detected in this worker.", flush=True)
    else:
        print(f"device: cuda:0 (physical {os.environ.get('CUDA_VISIBLE_DEVICES', '?')}) -- {torch.cuda.get_device_name(0)}", flush=True)

    # ---- dataset ----
    class MriFolder(Dataset):
        def __init__(self, files, transform):
            self.files = files
            self.transform = transform

        def __len__(self):
            return len(self.files)

        def __getitem__(self, idx):
            path, label = self.files[idx]
            img = Image.open(path).convert("RGB")
            return self.transform(img), label

    files = _discover_files(args.data_dir)
    train_files, val_files = _stratified_split(files, args.val_frac, args.seed)
    print(f"train {len(train_files):,}   val {len(val_files):,}", flush=True)

    img_size = args.img_size
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

    # ---- model ----
    print(f"\n=== {name} ===", flush=True)
    model = timm.create_model(name, pretrained=True, num_classes=len(CLASS_ORDER)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")

    best_macro_f1 = -1.0
    best_state = None
    best_epoch = 0
    no_improve = 0
    best_metrics: TrainResult | None = None
    last_epoch = 0
    t0 = time.time()

    for epoch in range(1, args.epochs + 1):
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

        # eval
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
                y_true, y_pred, target_names=CLASS_ORDER,
                output_dict=True, zero_division=0,
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
                weights_path=str(weights_dir / f"{name}.pt"),
            )
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= args.patience:
                print(f"  -> early stop (no macro-F1 gain for {args.patience} epochs)", flush=True)
                break

    assert best_state is not None and best_metrics is not None
    best_metrics.epochs_trained = last_epoch
    torch.save(best_state, best_metrics.weights_path)
    (results_dir / f"{name}.json").write_text(json.dumps(dataclasses.asdict(best_metrics), indent=2))
    print(
        f"\n[{name}] DONE  acc {best_metrics.val_accuracy:.4f}  "
        f"macroF1 {best_metrics.val_macro_f1:.4f}  AUC {best_metrics.val_auc_macro_ovr:.4f}  "
        f"epoch {best_metrics.best_epoch}/{best_metrics.epochs_trained}  "
        f"{best_metrics.train_seconds:.0f}s",
        flush=True,
    )
    return 0


# ============================================================ Shared helpers


def _discover_files(data_dir: Path) -> list[tuple[Path, int]]:
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


def _stratified_split(files, val_frac: float, seed: int):
    import numpy as np
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


# ============================================================ Orchestrator


def _resolve_gpus(arg_value: str | None) -> list[int]:
    """Pick which physical GPUs the orchestrator will distribute work
    over. `arg_value` is the --gpus CLI flag; None means auto-detect."""
    if arg_value:
        return [int(x) for x in arg_value.split(",") if x.strip()]
    try:
        import torch
        n = torch.cuda.device_count()
    except Exception:
        n = 0
    if n == 0:
        return []
    return list(range(n))


def _spawn_worker(
    *, model: str, gpu_id: int, log_path: Path, args: argparse.Namespace
) -> tuple[subprocess.Popen, "io.TextIOBase"]:
    """Launch one --single-model child pinned to a physical GPU."""
    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = str(gpu_id)
    log_file = open(log_path, "w", encoding="utf-8", buffering=1)
    log_file.write(f"=== {model} on physical GPU {gpu_id} ===\n")
    log_file.flush()
    cmd = [
        sys.executable, "-u", os.path.abspath(__file__),
        "--single-model", model,
        "--data-dir", str(args.data_dir),
        "--output-dir", str(args.output_dir),
        "--epochs", str(args.epochs),
        "--patience", str(args.patience),
        "--batch-size", str(args.batch_size),
        "--img-size", str(args.img_size),
        "--lr", str(args.lr),
        "--weight-decay", str(args.weight_decay),
        "--val-frac", str(args.val_frac),
        "--num-workers", str(args.num_workers),
        "--seed", str(args.seed),
    ]
    proc = subprocess.Popen(
        cmd, env=env, stdout=log_file, stderr=subprocess.STDOUT, text=True,
    )
    return proc, log_file


def run_orchestrator(args: argparse.Namespace) -> int:
    """Default mode. Fans the model list across all available GPUs."""
    args.output_dir.mkdir(parents=True, exist_ok=True)
    logs_dir = args.output_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    bakeoff_log = (args.output_dir / "bakeoff.log").open("w", encoding="utf-8", buffering=1)

    def tee(msg: str) -> None:
        print(msg, flush=True)
        bakeoff_log.write(msg + "\n")
        bakeoff_log.flush()

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    gpus = _resolve_gpus(args.gpus)
    if not gpus:
        tee("WARNING: no CUDA GPUs detected. Falling back to CPU on a single worker; this will be slow.")
        gpus = [-1]  # sentinel meaning "no CUDA_VISIBLE_DEVICES mask, just run on CPU"

    tee(f"orchestrator start: {len(models)} models across {len(gpus)} GPU(s) {gpus}")
    tee(f"  data_dir   = {args.data_dir}")
    tee(f"  output_dir = {args.output_dir}")
    tee(f"  models     = {','.join(models)}")
    tee(f"  epochs={args.epochs} batch={args.batch_size} img={args.img_size} lr={args.lr}")

    queue = list(models)
    active: dict[int, tuple[str, subprocess.Popen, object]] = {}
    started_at = time.time()
    failures: list[tuple[str, int | None]] = []

    while queue or active:
        # Launch on free GPUs
        for gpu_id in gpus:
            if gpu_id in active or not queue:
                continue
            model = queue.pop(0)
            log_path = logs_dir / f"{model}.log"
            tee(f"  [launch] {model} -> GPU {gpu_id}  (log: {log_path.relative_to(args.output_dir)})")
            proc, log_file = _spawn_worker(
                model=model,
                gpu_id=gpu_id if gpu_id >= 0 else 0,
                log_path=log_path,
                args=args,
            )
            active[gpu_id] = (model, proc, log_file)

        # Poll completions
        done: list[int] = []
        for gpu_id, (model, proc, log_file) in active.items():
            rc = proc.poll()
            if rc is None:
                continue
            done.append(gpu_id)
            log_file.close()
            elapsed = time.time() - started_at
            result_path = args.output_dir / "results" / f"{model}.json"
            if rc == 0 and result_path.exists():
                try:
                    res = json.loads(result_path.read_text())
                    tee(
                        f"  [done]   {model:<28s} GPU {gpu_id}  "
                        f"acc {res['val_accuracy']:.4f}  macroF1 {res['val_macro_f1']:.4f}  "
                        f"AUC {res['val_auc_macro_ovr']:.4f}  "
                        f"ep {res['best_epoch']}/{res['epochs_trained']}  "
                        f"({res['train_seconds']:.0f}s, wall {elapsed:.0f}s)"
                    )
                except Exception as exc:
                    tee(f"  [BROKEN] {model} GPU {gpu_id} returned 0 but result JSON unreadable: {exc}")
                    failures.append((model, rc))
            else:
                tee(f"  [FAIL]   {model:<28s} GPU {gpu_id} exit code {rc}  (see {logs_dir / f'{model}.log'})")
                failures.append((model, rc))
        for gpu_id in done:
            del active[gpu_id]

        if queue or active:
            time.sleep(2)

    # ---- Collect every result that landed on disk ----
    results_dir = args.output_dir / "results"
    results: list[dict] = []
    for model in models:
        f = results_dir / f"{model}.json"
        if f.exists():
            try:
                results.append(json.loads(f.read_text()))
            except Exception as exc:
                tee(f"  could not load {f}: {exc}")
    if not results:
        tee("ERROR: no candidate finished successfully. Inspect per-model logs.")
        bakeoff_log.close()
        return 1

    # ---- Summary table ----
    tee("")
    tee("=========================== Bake-off summary ===========================")
    header = f"{'model':28s}  {'acc':>6s}  {'macroF1':>8s}  {'AUC_ovr':>8s}  {'best_ep':>7s}  {'time(s)':>7s}"
    tee(header)
    tee("-" * len(header))
    results.sort(key=lambda r: r["val_macro_f1"], reverse=True)
    for r in results:
        tee(
            f"{r['model_name']:28s}  {r['val_accuracy']:6.4f}  {r['val_macro_f1']:8.4f}  "
            f"{r['val_auc_macro_ovr']:8.4f}  {r['best_epoch']:7d}  {r['train_seconds']:7.0f}"
        )

    winner = results[0]
    tee("")
    tee(f"WINNER: {winner['model_name']}  macroF1 {winner['val_macro_f1']:.4f}  acc {winner['val_accuracy']:.4f}")

    if failures:
        tee("")
        tee(f"Failures ({len(failures)}):")
        for model, rc in failures:
            tee(f"  {model}  exit_code={rc}")

    # ---- Audit log ----
    audit = {
        "candidates": results,
        "winner": winner,
        "failures": [{"model": m, "exit_code": rc} for m, rc in failures],
        "args": {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
    }
    (args.output_dir / "mri_bakeoff_log.json").write_text(json.dumps(audit, indent=2))
    tee(f"audit -> {args.output_dir / 'mri_bakeoff_log.json'}")

    if args.no_export:
        tee("--no-export set; skipping ONNX + meta overwrite.")
        bakeoff_log.close()
        return 0

    # ---- Export winner to ONNX ----
    tee("")
    tee(f"loading winner weights from {winner['weights_path']}")
    _export_winner(winner, args)
    bakeoff_log.close()
    return 0


def _export_winner(winner: dict, args: argparse.Namespace) -> None:
    """Re-build the winning architecture, load its saved state, export
    to ONNX, and write the meta.json the FastAPI backend consumes."""
    import torch
    import timm

    model = timm.create_model(
        winner["model_name"], pretrained=False, num_classes=len(CLASS_ORDER)
    )
    state = torch.load(winner["weights_path"], map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.train(False)
    dummy = torch.randn(1, 3, args.img_size, args.img_size)
    onnx_path = args.output_dir / "alzheimer_mri.onnx"
    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        str(onnx_path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )
    print(f"wrote ONNX -> {onnx_path} ({onnx_path.stat().st_size / 1024:.1f} KiB)")

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
            "test_accuracy": winner["val_accuracy"],
            "macro_f1": winner["val_macro_f1"],
            "auc_macro_ovr": winner["val_auc_macro_ovr"],
            "per_class_precision": {
                c: p for c, p in zip(CLASS_ORDER, winner["per_class_precision"])
            },
            "per_class_recall": {
                c: r for c, r in zip(CLASS_ORDER, winner["per_class_recall"])
            },
            "per_class_f1": {
                c: f for c, f in zip(CLASS_ORDER, winner["per_class_f1"])
            },
            "confusion_matrix_rows_true_cols_pred": winner["confusion"],
        },
        "model_type": f"{winner['model_name']} (timm, ImageNet pretrained, fine-tuned)",
        "training": {
            "epochs_trained": winner["epochs_trained"],
            "best_epoch": winner["best_epoch"],
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
    (args.output_dir / "alzheimer_mri.meta.json").write_text(json.dumps(meta, indent=2))
    print(f"wrote meta -> {args.output_dir / 'alzheimer_mri.meta.json'}")


# ============================================================ CLI


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=script_dir / "combined_images",
        help="Folder containing the 4 class subfolders.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=script_dir / "out",
        help="Where logs, per-model weights, results, ONNX, meta land.",
    )
    parser.add_argument(
        "--models",
        type=str,
        default=",".join(DEFAULT_MODELS),
        help="Comma-separated timm model names to bake off.",
    )
    parser.add_argument(
        "--gpus",
        type=str,
        default=None,
        help="Comma-separated physical GPU indices to use. Defaults to "
        "all detected.",
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
        help="Skip the final ONNX + meta export. Per-model results "
        "and weights still land in --output-dir.",
    )
    parser.add_argument(
        "--single-model",
        type=str,
        default=None,
        help="INTERNAL. When set, this process trains exactly that "
        "model and exits. Used by the orchestrator to fan out across "
        "GPUs via subprocess + CUDA_VISIBLE_DEVICES.",
    )
    args = parser.parse_args()

    if args.single_model:
        return run_single_model(args)
    return run_orchestrator(args)


if __name__ == "__main__":
    sys.exit(main())
