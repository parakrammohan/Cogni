/**
 * Build a `LocationAnalysis` from the patient's WebSocket-pushed
 * snapshots so the caregiver Map shows the *patient's* breadcrumb
 * trail rather than the caregiver device's own GPS.
 *
 * The WS feed only carries lat/lng + outOfBounds, so the rest of the
 * shape is filled with empty/zero values. That's fine — GeofencePanel
 * only needs `analysis.latest` (for centring + marker) and
 * `analysis.breadcrumbTrail` (for the polyline + dots). We append the
 * latest point to a small in-memory trail so the caregiver also sees
 * recent movement, not just the current pin.
 */

import { useEffect, useMemo, useState } from "react";

import type { LocationAnalysis } from "../features/location/lib/location";
import type { LocationPoint } from "../types/app";
import { useAuth } from "../auth/AuthContext";
import { useSubjectPatient } from "./useSubjectPatient";
import { useLiveStream } from "../ws/useLiveStream";

const MAX_TRAIL = 60; // ~1 minute at 1 Hz patient push rate

const EMPTY_ANALYSIS: LocationAnalysis = {
  latest: null,
  currentDistance: 0,
  outOfBounds: false,
  pacing: { active: false, crossings: 0, span: 0, width: 0 },
  dwelling: { active: false, diagonal: 0, duration: 0, width: 0, height: 0 },
  localTrail: [],
  breadcrumbTrail: [],
};

interface LiveLocation {
  lat: number;
  lng: number;
}

interface LiveSnapshotData {
  location?: LiveLocation | null;
  outOfBounds?: boolean;
}

/**
 * For caregivers: returns a `LocationAnalysis` derived from the live
 * patient feed. For patients (or when no patient is paired / no data
 * is arriving), returns null so the caller can use the local sensor
 * analysis as before.
 */
export function useCaregiverPatientLocation(): LocationAnalysis | null {
  const { user } = useAuth();
  const { patientId } = useSubjectPatient();
  const live = useLiveStream(user?.role === "caregiver" ? patientId : null);

  // Trail accumulation is a side effect (writes derived state on each new
  // snapshot) — keep it in useState/useEffect so React's render passes
  // stay pure even under Strict Mode / Concurrent rendering.
  const [trail, setTrail] = useState<LocationPoint[]>([]);

  useEffect(() => {
    if (user?.role !== "caregiver" || !live) return;
    const data = (live.data as LiveSnapshotData | undefined) ?? {};
    const loc = data.location;
    if (!loc) return;
    const tsRaw = live.ts;
    const timestamp =
      typeof tsRaw === "string" ? new Date(tsRaw).getTime() : Date.now();
    const point: LocationPoint = { lat: loc.lat, lng: loc.lng, timestamp };
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      // Dedupe trailing identical coords so the polyline doesn't collect
      // a million zero-length segments when the patient is still.
      if (last && last.lat === point.lat && last.lng === point.lng) return prev;
      return [...prev.slice(-MAX_TRAIL + 1), point];
    });
  }, [user?.role, live]);

  return useMemo(() => {
    if (user?.role !== "caregiver") return null;
    if (!live) return EMPTY_ANALYSIS;
    const data = (live.data as LiveSnapshotData | undefined) ?? {};
    const loc = data.location;
    if (!loc) return { ...EMPTY_ANALYSIS, breadcrumbTrail: trail };
    const tsRaw = live.ts;
    const timestamp =
      typeof tsRaw === "string" ? new Date(tsRaw).getTime() : Date.now();
    return {
      ...EMPTY_ANALYSIS,
      latest: { lat: loc.lat, lng: loc.lng, timestamp },
      outOfBounds: !!data.outOfBounds,
      breadcrumbTrail: trail,
    };
  }, [user?.role, live, trail]);
}
