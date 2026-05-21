/**
 * Tiny info-button + popover that surfaces honest cross-validated
 * metrics for any screening model. Keeps the main blurb in plain
 * language and tucks accuracy / precision / recall / F1 / AUC behind
 * a single click.
 *
 * Self-contained click-popover so we don't pull another @radix-ui
 * dependency just for this.
 */

import { Info, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ModelMeta } from "../../features/screening/types";
import { useTranslation } from "react-i18next";
interface MetricDef {
  key: string;
  label: string;
  format: (v: number) => string;
  explainer: string;
}
const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;
const RAW = (v: number) => v.toFixed(3);
const BINARY_METRICS: MetricDef[] = [
  {
    key: "cv_accuracy",
    label: "Accuracy",
    format: PCT,
    explainer:
      "Share of cases the model got right overall (correct positives + correct negatives).",
  },
  {
    key: "cv_precision",
    label: "Precision",
    format: PCT,
    explainer: "When the model says someone is at risk, how often it's actually right.",
  },
  {
    key: "cv_recall",
    label: "Recall",
    format: PCT,
    explainer: "Of the people who really are at risk, how many the model correctly flags.",
  },
  {
    key: "cv_f1",
    label: "F1 score",
    format: RAW,
    explainer: "A single number that balances precision and recall — closer to 1.00 is better.",
  },
  {
    key: "cv_auc",
    label: "AUC",
    format: RAW,
    explainer:
      "How well the model separates the two groups across every possible threshold. 1.00 is perfect, 0.50 is no better than a coin.",
  },
  {
    key: "cv_average_precision",
    label: "Average precision",
    format: RAW,
    explainer:
      "Precision averaged across recall levels — the right metric to look at when one outcome is rare.",
  },
];
const MULTICLASS_METRICS: MetricDef[] = [
  {
    key: "test_accuracy",
    label: "Accuracy",
    format: PCT,
    explainer:
      "Share of MRI slices the model assigned to the correct class on the held-out test set.",
  },
];
export function MetricsPopover({ meta, trigger }: { meta: ModelMeta | null; trigger?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!meta) return null;
  const definitions =
    meta.task === "multiclass_classification" ? MULTICLASS_METRICS : BINARY_METRICS;
  const available = definitions.filter((d) => typeof meta.metrics?.[d.key] === "number");
  const trainSize =
    typeof meta.training_rows === "number"
      ? meta.training_rows
      : typeof meta.metrics?.train_size === "number"
        ? meta.metrics.train_size
        : null;
  const triggerNode = trigger ?? (
    <button
      type="button"
      aria-label={t("metricsPopover.modelPerformanceDetails")}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-cyan-50 hover:text-cyan-700 hover:ring-cyan-300"
    >
      <Info size={15} aria-hidden />
      {t("metricsPopover.howWellDoesItWork")}
    </button>
  );
  return (
    <div ref={ref} className="relative inline-block">
      {trigger ? (
        <span onClick={() => setOpen((v) => !v)} role="presentation">
          {trigger}
        </span>
      ) : (
        triggerNode
      )}
      {open ? (
        <div
          role="dialog"
          aria-label={t("metricsPopover.modelPerformance")}
          className="absolute right-0 z-[1200] mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-elevated)"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">
                {t("metricsPopover.howWellDoesItWork")}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("metricsPopover.numbersBelowComeFromHoldingOutAC")}
              </p>
            </div>
            <button
              type="button"
              aria-label={t("metricsPopover.close")}
              onClick={() => setOpen(false)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          <ul className="space-y-2.5">
            {available.map((d) => {
              const value = meta.metrics![d.key] as number;
              return (
                <li key={d.key} className="flex flex-col gap-0.5 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">{d.label}</span>
                    <span className="font-mono text-base font-semibold tabular-nums text-cyan-700">
                      {d.format(value)}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-slate-600">{d.explainer}</p>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid gap-1 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
            <div>
              <span className="font-semibold text-slate-700">{t("metricsPopover.modelType")}</span>{" "}
              {meta.model_type}
            </div>
            <div>
              <span className="font-semibold text-slate-700">{t("metricsPopover.features")}</span>{" "}
              {meta.feature_count}
            </div>
            {trainSize !== null ? (
              <div>
                <span className="font-semibold text-slate-700">
                  {t("metricsPopover.trainingRows")}
                </span>{" "}
                {trainSize.toLocaleString()}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
