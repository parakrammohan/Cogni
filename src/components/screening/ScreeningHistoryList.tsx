/**
 * Past screening runs for one model, scoped to one patient. Backend
 * already records every run; this just surfaces them in the UI so
 * the caregiver has an audit trail of past readings without leaving
 * the screening tab.
 */

import { ChevronDown, ChevronRight, History } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useScreeningHistory, screeningHistoryKeys } from "../../api/screening";
import type { ModelKey, RiskBand } from "../../features/screening/types";
import { useSubjectPatient } from "../../hooks/useSubjectPatient";
import { cx, relativeTime } from "../../lib/utils";
import { useTranslation } from "react-i18next";
const BAND_TONE: Record<RiskBand, string> = {
  low: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  moderate: "bg-amber-100 text-amber-800 ring-amber-200",
  high: "bg-red-100 text-red-800 ring-red-200",
};

/** Imperative cache invalidator the parent can call after running a
 *  fresh screening so the new row appears without a manual reload. */
export function useInvalidateScreeningHistory() {
  const qc = useQueryClient();
  return (patientId: string | null, model: ModelKey) => {
    if (!patientId) return;
    qc.invalidateQueries({
      queryKey: screeningHistoryKeys.list(patientId, model),
    });
  };
}
export function ScreeningHistoryList({ model }: { model: ModelKey }) {
  const { t } = useTranslation();
  const { patientId } = useSubjectPatient();
  const { data, isLoading, isError } = useScreeningHistory(patientId, model);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!patientId) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-(--shadow-soft)">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <History size={14} className="text-slate-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("screeningHistoryList.pastRunsOnThisPatient")}
        </span>
        {data && data.length > 0 ? (
          <span className="ml-auto text-xs text-slate-500">
            {data.length} record{data.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </header>

      {isLoading ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          {t("screeningHistoryList.loadingHistory")}
        </p>
      ) : isError ? (
        <p className="px-4 py-6 text-sm text-red-700">
          {t("screeningHistoryList.couldNotLoadPastRunsTheBackendMa")}
        </p>
      ) : !data || data.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          {t("screeningHistoryList.noPastRunsYetSubmitTheFormAboveT")}
        </p>
      ) : (
        <ul>
          {data.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <li key={row.id} className="border-b border-slate-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  aria-expanded={isOpen}
                >
                  <span className="text-slate-400" aria-hidden>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-slate-900">
                    {(row.probability * 100).toFixed(1)}%
                  </span>
                  <span
                    className={cx(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ring-1",
                      BAND_TONE[row.band],
                    )}
                  >
                    {row.band}
                  </span>
                  <span className="text-xs text-slate-500">
                    {relativeTime(new Date(row.created_at).getTime())}
                  </span>
                </button>
                {isOpen ? <InputsPreview inputs={row.inputs_json} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
function InputsPreview({ inputs }: { inputs: Record<string, unknown> }) {
  const { t } = useTranslation();
  const entries = Object.entries(inputs);
  if (entries.length === 0) {
    return (
      <div className="px-4 pb-4 pl-10 text-xs text-slate-500">
        {t("screeningHistoryList.noInputsStored")}
      </div>
    );
  }
  return (
    <div className="bg-slate-50 px-4 pb-4 pl-10 text-xs leading-5 text-slate-700">
      <p className="mb-1 font-semibold text-slate-600">
        {t("screeningHistoryList.inputsAtTheTimeOfThisRun")}
      </p>
      <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 py-0.5">
            <dt className="truncate font-mono text-xs text-slate-500">{k}</dt>
            <dd className="font-mono text-xs text-slate-900">{formatValue(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(3);
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
