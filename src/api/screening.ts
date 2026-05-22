/**
 * Screening run history. Backend exposes
 *   GET /api/v1/patients/{patient_id}/screening?model=<key>
 * and we render the rows under each screening tab so the caregiver
 * has an audit trail of past runs without leaving the page.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ModelKey, RiskBand } from "../features/screening/types";
import { api } from "./client";

export interface ScreeningHistoryRow {
  id: string;
  patient_id: string;
  model: ModelKey;
  probability: number;
  band: RiskBand;
  inputs_json: Record<string, unknown>;
  classes_json: Record<string, unknown> | null;
  created_at: string;
}

export const screeningHistoryKeys = {
  list: (patientId: string, model: ModelKey) => ["screening", "history", patientId, model] as const,
};

export function useScreeningHistory(patientId: string | null, model: ModelKey, limit = 20) {
  return useQuery({
    queryKey: screeningHistoryKeys.list(patientId ?? "_unset_", model),
    queryFn: () =>
      api<ScreeningHistoryRow[]>(
        `/api/v1/patients/${patientId}/screening?model=${model}&limit=${limit}`,
      ),
    enabled: !!patientId,
    staleTime: 30_000,
    // Keep showing the previously-loaded rows during a refetch
    // (caregiver edits a field, submits, cache invalidates, refetch
    // briefly errors during HF cold-start) so the panel doesn't
    // flash a scary "Could not load past runs" banner on top of
    // perfectly good data.
    placeholderData: keepPreviousData,
    // One retry is enough — the historical 3-attempt exponential
    // backoff was hammering a cold-starting backend with three
    // failures in a row and the user saw the error flash three times.
    retry: 1,
    // Stop refetch-on-window-focus from re-triggering the same error
    // every time the caregiver tabs between the form and another app.
    refetchOnWindowFocus: false,
  });
}
