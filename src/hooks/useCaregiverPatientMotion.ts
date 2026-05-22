/**
 * Reads the patient's accelerometer + gyroscope sample stream out of
 * the live WebSocket snapshot so the caregiver Gait scene's sparklines
 * reflect the *patient's* device, not the caregiver's. Mirrors the
 * pattern used by useCaregiverPatientLocation.
 *
 * No DB persistence — motion samples live entirely in the realtime
 * feed. When the patient goes offline (no fresh snapshot for
 * SNAPSHOT_FRESHNESS_MS) we drop the cached samples so the panel
 * clears instead of freezing on the last burst forever.
 */

import { useEffect, useMemo, useState } from "react";

import type { MotionSample } from "../types/app";
import { useAuth } from "../auth/AuthContext";
import { useSubjectPatient } from "./useSubjectPatient";
import { useLiveStream } from "../ws/useLiveStream";

const SNAPSHOT_FRESHNESS_MS = 10_000;

interface LiveSnapshotData {
  motionSamples?: MotionSample[];
}

/**
 * Returns the patient's most recent motion-sample window as broadcast
 * over the WebSocket. Empty array when offline or when the role isn't
 * caregiver.
 */
export function useCaregiverPatientMotion(): MotionSample[] {
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
    if (user?.role !== "caregiver") return [];
    if (!live || stale) return [];
    const data = (live.data as LiveSnapshotData | undefined) ?? {};
    return Array.isArray(data.motionSamples) ? data.motionSamples : [];
  }, [user?.role, live, stale]);
}
