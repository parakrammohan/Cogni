# Alzheimer's MRI dataset audit

> Why we don't trust the dataset we were originally handed, and what we
> did about it.

## What we found

We were given the "AugmentedAlzheimerDataset" — a 44 000-image
4-class Alzheimer's MRI corpus. After a closer look we tracked it back
to its source: a 6 400-image set the Kaggle uploader (`uraninjo`) calls
the "OriginalDataset". The augmented set is **purely transformation-
based expansion** of those 6 400 originals — rotations, flips,
brightness jitter, etc. Same patients, same slices, different pixels.

The smoking gun is the per-class inflation table:

| Class | Unique original slices | Augmented copies | Inflation |
|---|---:|---:|---:|
| MildDemented | 896 | 10 000 | **11.2 ×** |
| **ModerateDemented** | **64** | **10 000** | **156.2 ×** |
| NonDemented | 3 200 | 12 800 | 4.0 × |
| VeryMildDemented | 2 240 | 11 200 | 5.0 × |
| **Total** | **6 400** | **44 000** | **6.9 ×** |

The standout is **ModerateDemented** — only **64 unique slices** in the
real world, inflated to 10 000 by 156× augmentation. Whatever model is
trained on this class is effectively memorising 64 brains.

## Why this matters

A standard 80/20 random split on the augmented set looks like
classification but is mostly leak detection. Every image in the
"validation" set has 5–156 near-identical augmented twins sitting in
the training set. A model that learns "in the train set, slightly
rotated image X means class Y" trivially generalises to "in the val
set, slightly rotated image X means class Y" — because that's
literally the same slice.

This is the **textbook patient-level leakage pitfall** in medical
imaging, and the metric inflation it produces is large. Published
results on this exact Kaggle dataset routinely report 99 %+ accuracy
on the augmented set; the same models on truly held-out patients
collapse to 60-80 %. The 78.2 % the original Cogni MRI MLP reported
on the augmented set was almost certainly inflated for the same
reason.

## What we did about it

1. **Switched the training corpus to the OriginalDataset** (the
   6 400 unaugmented slices) so the model isn't learning the
   augmentation pipeline.
2. **Augment on the fly in training**, not in advance. The PyTorch
   training loop applies the same random crop / flip / colour jitter
   transforms `transforms.RandomHorizontalFlip` etc. on every batch,
   so the model sees a different augmentation of each slice every
   epoch, while the validation set stays consistent and unaugmented.
3. **Report honest image-level CV.** We split the 6 400 by image (not
   by patient — see "Limitation" below) and treat the resulting
   accuracy as a ceiling, not a floor.

The training script that drives this lives in the
[`cogni_mri_bakeoff`](../bundle/cogni_mri_bakeoff/) bundle. It points at
`combined_images/` by default — pass `--data-dir original_dataset` to
use the honest set.

## Limitation we still have

Even the OriginalDataset doesn't ship patient IDs in its filenames.
The naming conventions are:

| Pattern | Example | Count |
|---|---|---:|
| `<class><n>.jpg` | `mildDem94.jpg` | 5 121 |
| `<n> (<m>).jpg` | `26 (19).jpg` | 1 252 |
| `<n>.jpg` | `27.jpg` | 27 |

The `<n>` is a sequential counter, not a patient ID. So we can't run
GroupKFold-by-patient on this set either. True patient-level CV would
require going back to the OASIS-1 release upstream of Kaggle, which
ships proper patient IDs like `OAS1_0001_MR1`. That's a follow-up.

In the meantime: training on the original beats training on the
augmented for the same reason a poll of 6 400 voters beats a poll of
the same 6 400 voters asked the same question 7 times. The honest
ceiling on image-level CV is the metric we ship in the
[screening "How well does it work?" popover](../src/components/screening/MetricsPopover.tsx);
the caveat string in the MRI meta calls out both layers of the issue.

## How to reproduce the audit

The numbers above come from
[`datasets/scripts/audit_alzheimer_mri.py`](../datasets/scripts/audit_alzheimer_mri.py).
It walks the original-dataset folder + the source zip and emits both
the table you see above and a machine-readable JSON next to this doc
(`alzheimer_mri_audit.json`).
