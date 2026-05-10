import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Brain, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { runScreening, loadScreeningModel } from "../../features/screening/inference";
import {
  SCREENING_GROUPS,
  defaultScreeningValues,
  type ScreeningField,
} from "../../features/screening/schema";
import type { ScreeningMeta, ScreeningResult } from "../../features/screening/types";

const RISK_TONE: Record<ScreeningResult["riskBand"], { surface: string; ring: string; label: string }> = {
  low: {
    surface: "bg-emerald-50 text-emerald-900",
    ring: "ring-emerald-200",
    label: "Low estimated risk",
  },
  moderate: {
    surface: "bg-amber-50 text-amber-900",
    ring: "ring-amber-300",
    label: "Moderate estimated risk",
  },
  high: {
    surface: "bg-red-50 text-red-900",
    ring: "ring-red-300",
    label: "High estimated risk",
  },
};

export function ScreeningCard() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(defaultScreeningValues);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelMeta, setModelMeta] = useState<ScreeningMeta | null>(null);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (open && modelStatus === "idle") {
      setModelStatus("loading");
      loadScreeningModel()
        .then(({ meta }) => {
          setModelMeta(meta);
          setModelStatus("ready");
        })
        .catch((err) => {
          setModelStatus("error");
          setError(err instanceof Error ? err.message : "Failed to load model");
        });
    }
  }, [open, modelStatus]);

  function update(name: string, value: number) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setResult(null);
  }

  async function compute() {
    setLoading(true);
    setError(null);
    try {
      const out = await runScreening(values);
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inference failed");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setValues(defaultScreeningValues());
    setResult(null);
    setError(null);
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft) sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
            <Brain size={20} />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-900">
              Alzheimer's risk screening
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
              Runs a gradient-boosting model in your browser on a 32-feature
              clinical questionnaire. Trained on a public dataset of 2,149
              patients (95% CV accuracy, AUC 0.95). Educational tool — not a
              diagnosis.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700"
        >
          {open ? "Hide" : "Open"}
        </button>
      </header>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-5 space-y-5">
              {modelStatus === "loading" ? (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <Loader2 size={16} className="animate-spin" />
                  Loading ONNX model…
                </div>
              ) : null}

              {modelStatus === "error" ? (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle size={16} />
                  {error || "Model failed to load."}
                </div>
              ) : null}

              {modelMeta ? (
                <div className="space-y-5">
                  {SCREENING_GROUPS.map((group) => (
                    <div key={group.title}>
                      <div className="mb-2 flex items-baseline justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                          {group.title}
                        </h3>
                        <span className="text-xs text-slate-400">
                          {group.description}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.fields.map((field) => (
                          <Field
                            key={field.name}
                            field={field}
                            value={values[field.name]}
                            onChange={(v) => update(field.name, v)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={compute}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
                      >
                        {loading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Sparkles size={16} />
                        )}
                        Compute risk
                      </button>
                      <button
                        type="button"
                        onClick={reset}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Reset to defaults
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      Model: {modelMeta.model_type} · {modelMeta.training_rows.toLocaleString()} rows · runs locally via WebAssembly
                    </p>
                  </div>

                  {result ? (
                    <ResultCard result={result} meta={modelMeta} />
                  ) : null}

                  {error && modelStatus === "ready" ? (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                      <AlertTriangle size={16} />
                      {error}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ScreeningField;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  const v = Number.isFinite(value) ? (value as number) : field.default;

  if (field.kind === "binary") {
    return (
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
        <span className="font-medium text-slate-800">
          {field.label}
          {field.hint ? (
            <span className="ml-1 text-xs font-normal text-slate-400">
              {field.hint}
            </span>
          ) : null}
        </span>
        <input
          type="checkbox"
          checked={v === 1}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="h-4 w-4 cursor-pointer accent-cyan-600"
        />
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-800">{field.label}</span>
        <select
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-baseline justify-between font-medium text-slate-800">
        {field.label}
        {field.unit ? (
          <span className="text-xs font-normal text-slate-400">{field.unit}</span>
        ) : null}
      </span>
      <input
        type="number"
        value={v}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
      />
      {field.hint ? (
        <span className="text-xs text-slate-400">{field.hint}</span>
      ) : null}
    </label>
  );
}

function ResultCard({
  result,
  meta,
}: {
  result: ScreeningResult;
  meta: ScreeningMeta;
}) {
  const tone = RISK_TONE[result.riskBand];
  const pct = (result.probability * 100).toFixed(1);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-2xl ring-2 ${tone.ring} ${tone.surface} p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
            {tone.label}
          </p>
          <p className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
            {pct}%
          </p>
          <p className="mt-1 text-sm opacity-80">
            Predicted probability of: <span className="font-semibold">{result.label}</span>
          </p>
        </div>
        <div className="text-right text-xs opacity-70">
          <div>Model AUC: {meta.metrics.cv_auc_mean.toFixed(3)}</div>
          <div>CV accuracy: {(meta.metrics.cv_accuracy_mean * 100).toFixed(1)}%</div>
          <div>Held-out accuracy: {(meta.metrics.holdout_accuracy * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/60">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${result.probability * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${
            result.riskBand === "high"
              ? "bg-red-500"
              : result.riskBand === "moderate"
                ? "bg-amber-500"
                : "bg-emerald-500"
          }`}
        />
      </div>
      <p className="mt-3 text-xs leading-5 opacity-75">
        Computed locally in your browser via ONNX Runtime Web — no data leaves
        the device. This is an educational risk score, not a diagnostic
        evaluation.
      </p>
    </motion.div>
  );
}
