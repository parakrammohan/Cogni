import { AlertTriangle, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { loadModel, runBinary } from "../../features/screening/inference";
import type { ScreeningGroup } from "../../features/screening/schemas/common";
import { defaultsFor } from "../../features/screening/schemas/common";
import type { BinaryResult, ModelKey, ModelMeta } from "../../features/screening/types";
import { useSubjectPatient } from "../../hooks/useSubjectPatient";

import { BinaryResultCard } from "./BinaryResultCard";
import { FormRenderer } from "./FormRenderer";
import { MetricsPopover } from "./MetricsPopover";
import {
  ScreeningHistoryList,
  useInvalidateScreeningHistory,
} from "./ScreeningHistoryList";

interface PresetButton {
  id: string;
  label: string;
  description?: string;
  values: Record<string, number>;
}

interface BinaryFormCardProps {
  modelKey: ModelKey;
  groups: ScreeningGroup[];
  presets?: PresetButton[];
  metricKeys?: ReadonlyArray<{ key: string; label: string; pct?: boolean }>;
  /** Slot for any per-model preamble shown above the form (caveats, hints). */
  intro?: ReactNode;
}

export function BinaryFormCard({
  modelKey,
  groups,
  presets,
  metricKeys,
  intro,
}: BinaryFormCardProps) {
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [values, setValues] = useState<Record<string, number>>(() => defaultsFor(groups));
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const { patientId } = useSubjectPatient();
  const invalidateHistory = useInvalidateScreeningHistory();

  useEffect(() => {
    setModelStatus("loading");
    loadModel(modelKey)
      .then(({ meta }) => {
        setMeta(meta);
        setModelStatus("ready");
      })
      .catch((err) => {
        setModelStatus("error");
        setError(err instanceof Error ? err.message : "Failed to load model");
      });
  }, [modelKey]);

  function update(name: string, value: number) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setResult(null);
    setActivePreset(null);
  }

  async function compute() {
    if (!patientId) {
      setError("Sign in as / pair with a patient before running screening.");
      return;
    }
    if (modelKey === "alzheimer_mri") {
      setError("MRI runs from the upload card, not this form.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      setResult(await runBinary(modelKey, values, patientId));
      // Surface the new row immediately in the history list below.
      invalidateHistory(patientId, modelKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inference failed");
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setValues(defaultsFor(groups));
    setResult(null);
    setActivePreset(null);
  }

  function applyPreset(p: PresetButton) {
    setValues({ ...defaultsFor(groups), ...p.values });
    setResult(null);
    setActivePreset(p.id);
  }

  return (
    <div className="space-y-5">
      {intro ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 sm:flex-1">{intro}</div>
          <div className="self-start">
            <MetricsPopover meta={meta} />
          </div>
        </div>
      ) : null}

      {modelStatus === "loading" ? (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" />
          Loading model metadata…
        </div>
      ) : null}

      {modelStatus === "error" ? (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error || "Model failed to load."}</span>
        </div>
      ) : null}

      {presets && presets.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  activePreset === p.id
                    ? "border-cyan-500 bg-cyan-50 text-cyan-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
                title={p.description}
              >
                {p.label}
              </button>
            ))}
          </div>
          {activePreset && presets.find((p) => p.id === activePreset)?.description ? (
            <p className="mt-2 text-xs text-slate-500">
              {presets.find((p) => p.id === activePreset)?.description}
            </p>
          ) : null}
        </div>
      ) : null}

      {meta ? <FormRenderer groups={groups} values={values} onChange={update} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={compute}
            disabled={running || modelStatus !== "ready"}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Compute risk
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
        {meta ? (
          <p className="text-xs text-slate-400">
            Trained on {meta.training_rows.toLocaleString()} records
          </p>
        ) : null}
      </div>

      {result && meta ? (
        <BinaryResultCard result={result} meta={meta} metricKeys={metricKeys} />
      ) : null}

      {modelStatus === "ready" ? (
        <ScreeningHistoryList model={modelKey} />
      ) : null}

      {error && modelStatus === "ready" ? (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
