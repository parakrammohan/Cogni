# Cogni MRI bake-off

Trains seven `timm` CNN backbones on the 4-class brain-MRI corpus,
**runs them in parallel across every available GPU**, picks the best
by validation macro-F1, and exports the winner to ONNX so a CPU-only
FastAPI backend can serve it.

Default candidates (`--models` to override):

| Backbone | Params |
|---|---|
| mobilenetv3_small_100 | 2.5 M |
| mobilenetv3_large_100 | 5.4 M |
| resnet18 | 11.7 M |
| efficientnet_b0 | 5.3 M |
| efficientnet_b2 | 9.1 M |
| convnext_tiny | 28 M |
| resnet50 | 25 M |

---

## How it parallelises

With 4 GPUs and 7 candidates: the orchestrator launches one subprocess
per GPU pinned via `CUDA_VISIBLE_DEVICES`, each training a different
model. As each finishes, the next queued model starts on the freed
GPU. With 7 models on 4 GPUs you get roughly 2 sequential slots per
card, so total wall time ≈ `max(per-model time) × 2`.

Per-model stdout/stderr go to `out/logs/<model>.log` so the streams
don't interleave. A top-level `out/bakeoff.log` records the
orchestrator's launch / done lines and the final summary — that's
the file to share for advice on which model to ship.

---

## Setup

```bash
unzip cogni_mri_bakeoff.zip
cd cogni_mri_bakeoff

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -U pip
pip install -r requirements.txt
```

If your box needs a specific CUDA build of PyTorch:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

## Get the dataset

Drop the Kaggle "Alzheimer's MRI combined_images" set into a folder
named `combined_images/` next to the script:

```
cogni_mri_bakeoff/
├── train_alzheimer_mri_v2.py
├── requirements.txt
├── README.md
└── combined_images/
    ├── MildDemented/        ~10 k jpgs
    ├── ModerateDemented/    ~10 k jpgs
    ├── NonDemented/         ~12 k jpgs
    └── VeryMildDemented/    ~11 k jpgs
```

Either `scp -r combined_images/ user@gpu-box:~/cogni_mri_bakeoff/` from
your laptop, or grab it on the GPU box with the Kaggle CLI.

## Run

Defaults pick up every CUDA device the driver sees:

```bash
python train_alzheimer_mri_v2.py
```

Typical 4×A5000 invocation:

```bash
python train_alzheimer_mri_v2.py \
    --epochs 25 \
    --batch-size 64 \
    --img-size 224 \
    --num-workers 8
```

Restrict to specific physical GPUs:

```bash
python train_alzheimer_mri_v2.py --gpus 0,1,2,3 --epochs 25
```

Fast first pass — skip the slower / bigger backbones:

```bash
python train_alzheimer_mri_v2.py \
    --models mobilenetv3_small_100,mobilenetv3_large_100,resnet18,efficientnet_b0 \
    --epochs 15
```

Sweep without overwriting the live ONNX/meta:

```bash
python train_alzheimer_mri_v2.py --no-export
```

## Output layout

By default everything lands in `./out/` next to the script
(override with `--output-dir`):

```
out/
├── bakeoff.log                      ← orchestrator-level summary
│                                       (share this with me)
├── mri_bakeoff_log.json             ← every candidate's full metric
│                                       block as JSON
├── logs/
│   ├── mobilenetv3_small_100.log    ← full stdout/stderr of each
│   ├── mobilenetv3_large_100.log       worker (epoch lines, errors,
│   ├── …                               etc.)
├── results/
│   ├── mobilenetv3_small_100.json   ← per-model TrainResult
│   ├── …
├── weights/
│   ├── mobilenetv3_small_100.pt     ← state_dict at best val macroF1
│   ├── …
├── alzheimer_mri.onnx               ← winning model exported to ONNX
│                                       (opset 17, dynamic batch axis,
│                                       input [1, 3, IMG_SIZE, IMG_SIZE])
└── alzheimer_mri.meta.json          ← classes, input layout, per-class
                                        precision/recall/F1, confusion
                                        matrix, hyperparameters, caveats
```

To use the winner in the live app: drop `out/alzheimer_mri.onnx` and
`out/alzheimer_mri.meta.json` into `backend/app/ml/artifacts/` in the
Cogni repo, commit, push.

## Sharing logs back to me

The most useful file is `out/bakeoff.log` — it shows the launch /
done lines and the final summary table sorted by macro-F1. Paste
that into the chat and I'll tell you whether the small models are
already good enough to ship, or which larger one is actually worth
the inference cost.

If a model fails, the orchestrator prints `[FAIL] <model> exit code
N (see logs/<model>.log)` — that per-model log has the real
traceback.

## Notes

- **Dataset caveat.** The Kaggle combined_images set augments the
  same underlying patient slices many times and ships no patient IDs,
  so image-level train/val splits leak between sets. Whatever number
  the script reports overstates clinical performance on truly unseen
  patients. The training meta carries this caveat into the UI's
  "How well does it work?" popover.
- **Speed estimate.** A5000 is roughly 1.5× a T4 for this workload.
  With 4 of them in parallel, the full 7-backbone bake-off at 20
  epochs should land in ~30-45 minutes wall time.
- **Reproducibility.** `--seed 42` default. Per-fold split is
  deterministic.
- **Worker pinning.** Each worker subprocess sees `CUDA_VISIBLE_DEVICES`
  set to one physical GPU and trains on `cuda:0` inside that masked
  view. The orchestrator itself never imports torch in its own
  process to avoid initialising the CUDA driver before forking.
