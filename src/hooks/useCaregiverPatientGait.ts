/**
 * Reads the patient's full gait analysis out of the live WebSocket
 * snapshot so the caregiver Gait scene's risk summary + signal cards
 * (vertical oscillation, lateral asymmetry, forward momentum, impact
 * stillness, peak magnitude) reflect the patient's device, not the
 * caregiver's own accelerometer. Mirrors useCaregiverPatientMotion.
 *
 * Returns null when the patient hasn't sent a fresh gait snapshot
 * recently, so the caller can fall back to a local default.
 */

import { useEffect, useMemo, useState } from "react";

import type { GaitAnalysis } from "../features/motion/lib/gait";
import { useAuth } from "../auth/AuthContext";
import { useSubjectPatient } from "./useSubjectPatient";
import { useLiveStream } from "../ws/useLiveStream";

const SNAPSHOT_FRESHNESS_MS = 10_000;

interface LiveSnapshotData {
  gait?: GaitAnalysis;
}

export function useCaregiverPatientGait(): GaitAnalysis | null {
  const { user } = useAuth();
  const { patientId } = useSubjectPatient();
  const live = useLiveStream(user?.role === "caregiver" ? patientId : null);
  const [stale, setStale] = useState(true);

  const lastSeenMs = live?.ts ? new Date(live.ts as string).getTime() : null;

  useEffect(() => {
    if (user?.role !== "caregiver" || lastSeenMs === null) {
      setStale(true);
      return;
    }
    const tick = () => setStale(Date.now() - lastSeenMs > SNAPSHOT_FRESHNESS_MS);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [user?.role, lastSeenMs]);

  return useMemo(() => {
    if (user?.role !== "caregiver") return null;
    if (!live || stale) return null;
    const data = (live.data as LiveSnapshotData | undefined) ?? {};
    return data.gait && typeof data.gait === "object" ? data.gait : null;
  }, [user?.role, live, stale]);
}
