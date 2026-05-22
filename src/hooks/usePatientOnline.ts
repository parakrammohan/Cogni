import { useEffect, useState } from "react";

import { useLiveConnectionStatus, useLiveStream } from "../ws/useLiveStream";
import { useSubjectPatient } from "./useSubjectPatient";

const FRESHNESS_WINDOW_MS = 10_000;

/**
 * True when the WS channel is open AND a patient_state snapshot has
 * arrived within the last 10 s. Matches the freshness threshold used
 * by OverviewScene's "Patient online" pill so the sidebar's butterfly
 * heart and the dashboard pill flip together.
 *
 * Always false for patient-role users — "patient online" only makes
 * sense from the caregiver's perspective.
 */
export function usePatientOnline(): boolean {
  const { patientId } = useSubjectPatient();
  const wsStatus = useLiveConnectionStatus();
  const snapshot = useLiveStream(patientId);
  const [now, setNow] = useState(() => Date.now());

  const lastSeenMs = snapshot?.ts ? new Date(snapshot.ts as string).getTime() : null;

  // Tick once a second so the boolean drops back to false ~10 s after
  // the last snapshot, without waiting for an unrelated re-render.
  useEffect(() => {
    if (!lastSeenMs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lastSeenMs]);

  if (wsStatus !== "open") return false;
  if (lastSeenMs === null) return false;
  return now - lastSeenMs < FRESHNESS_WINDOW_MS;
}
