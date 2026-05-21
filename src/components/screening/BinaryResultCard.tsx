import { motion } from "framer-motion";

import type { BinaryResult, ModelMeta } from "../../features/screening/types";

const TONE: Record<BinaryResult["riskBand"], { surface: string; ring: string; bar: string; label: string }> = {
  low: {
    surface: "bg-emerald-50 text-emerald-900",
    ring: "ring-emerald-200",
    bar: "bg-emerald-500",
    label: "Low estimated risk",
  },
  moderate: {
    surface: "bg-amber-50 text-amber-900",
    ring: "ring-amber-300",
    bar: "bg-amber-500",
    label: "Moderate estimated risk",
  },
  high: {
    surface: "bg-red-50 text-red-900",
    ring: "ring-red-300",
    bar: "bg-red-500",
    label: "High estimated risk",
  },
};

interface Props {
  result: BinaryResult;
  meta: ModelMeta;
  metricKeys?: ReadonlyArray<{ key: string; label: string; pct?: boolean }>;
}

export function BinaryResultCard({ result, meta, metricKeys }: Props) {
  const tone = TONE[result.riskBand];
  const probabilityPct = (result.probability * 100).toFixed(1);
  const metrics = metricKeys ?? [
    { key: "cv_auc_mean", label: "CV AUC" },
    { key: "cv_accuracy_mean", label: "CV accuracy", pct: true },
  ];

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
          <p className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{probabilityPct}%</p>
          <p className="mt-1 text-sm opacity-80">
            Predicted probability of: <span className="font-semibold">{result.label}</span>
          </p>
        </div>
        <div className="text-right text-xs opacity-70">
          {metrics.map(({ key, label, pct }) => {
            const v = meta.metrics[key];
            if (typeof v !== "number") return null;
            return (
              <div key={key}>
                {label}: {pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/60">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${result.probability * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${tone.bar}`}
        />
      </div>
      <p className="mt-3 text-xs leading-5 opacity-75">
        Computed server-side from the patient's encrypted record. Result is
        persisted to the patient's screening history. This is an educational
        risk score, not a diagnostic evaluation.
      </p>

      <TopFeatures meta={meta} />
    </motion.div>
  );
}

function TopFeatures({ meta }: { meta: ModelMeta }) {
  const top = (meta.feature_importances ?? []).slice(0, 5);
  if (top.length === 0) return null;
  const max = top[0]!.importance_pct || 1;
  return (
    <div className="mt-4 rounded-xl bg-white/60 p-3 ring-1 ring-white/40">
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
        Top features this model relies on
      </p>
      <p className="mt-0.5 text-xs leading-5 opacity-70">
        Global importance — how much the model weighs each input across
        all patients. Not a per-patient attribution.
      </p>
      <ul className="mt-2 space-y-1.5">
        {top.map((f) => (
          <li key={f.name} className="flex items-center gap-2 text-xs">
            <span className="w-44 truncate font-mono">{f.name}</span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-current opacity-70"
                style={{ width: `${(f.importance_pct / max) * 100}%` }}
              />
            </span>
            <span className="w-12 text-right font-mono tabular-nums">
              {f.importance_pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
