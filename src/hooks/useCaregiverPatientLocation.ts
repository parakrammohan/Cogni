/**
 * Build a `LocationAnalysis` from the patient's WebSocket-pushed
 * snapshots so the caregiver Map shows the *patient's* breadcrumb
 * trail rather than the caregiver device's own GPS.
 *
 * The WS feed only carries lat/lng + outOfBounds, so the rest of the
 * shape is filled with empty/zero values. That's fine — GeofencePanel
 * only needs `analysis.latest` (for centring + marker) and
 * `analysis.breadcrumbTrail` (for the polyline + dots).
 *
 * The breadcrumb trail lives entirely in React state in this hook —
 * NOTHING is written to the database. The DB has geofence_zones and
 * geofence_settings (safe-zone polygons + wandering toggle); the raw
 * lat/lng stream is realtime-only. Dropping `trail` here is the full
 * extent of "clear the cached map data".
 *
 * Clearing rules:
 *   - Patient goes offline (no fresh snapshot for SNAPSHOT_FRESHNESS_MS) → clear
 *   - Patient is online but the snapshot has no location (GPS revoked / denied) → clear
 *   - Caregiver re-pairs with a different patient → clear
 */

import { useEffect, useMemo, useState } from "react";

import type { LocationAnalysis } from "../features/location/lib/location";
import type { LocationPoint } from "../types/app";
import { useAuth } from "../auth/AuthContext";
import { useSubjectPatient } from "./useSubjectPatient";
import { useLiveStream } from "../ws/useLiveStream";

const MAX_TRAIL = 60; // ~1 minute at 1 Hz patient push rate
const SNAPSHOT_FRESHNESS_MS = 10_000;

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

  const [trail, setTrail] = useState<LocationPoint[]>([]);
  const [stale, setStale] = useState(true);

  const lastSeenMs = live?.ts ? new Date(live.ts as string).getTime() : null;

  // Drive `stale` from snapshot age. Recovery is immediate (the effect
  // re-runs when a new snapshot arrives); in the absence of new
  // snapshots the interval ticks once a second and flips `stale` to
  // true once the age crosses the threshold.
  useEffect(() => {
    if (user?.role !== "caregiver" || lastSeenMs === null) {
      setStale(true);
      return;
    }
    const tick = () => setStale(Date.now() - lastSeenMs > SNAPSHOT_FRESHNESS_MS);
    tick();
    // 2.5s tick (was 1s) to ease mobile render storm.
    const id = window.setInterval(tick, 2500);
    return () => window.clearInterval(id);
  }, [user?.role, lastSeenMs]);

  // Reset the trail when the paired patient changes — otherwise a
  // caregiver who re-pairs with a different patient would briefly see
  // the previous patient's breadcrumbs.
  useEffect(() => {
    setTrail([]);
  }, [patientId]);

  // Single trail-update effect: append on fresh-with-location, clear
  // otherwise. Consolidating avoids the bug where a separate
  // "clear on stale flip" effect would clear the trail, and a separate
  // "append on snapshot change" effect would then immediately re-append
  // the last-known point because `live` still holds the stale snapshot.
  useEffect(() => {
    if (user?.role !== "caregiver") return;
    const data = ((live?.data as LiveSnapshotData | undefined) ?? {});
    const loc = !stale && live ? data.location : null;
    if (!loc) {
      setTrail((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const tsRaw = live?.ts;
    const timestamp = typeof tsRaw === "string" ? new Date(tsRaw).getTime() : Date.now();
    const point: LocationPoint = { lat: loc.lat, lng: loc.lng, timestamp };
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      // Dedupe trailing identical coords so the polyline doesn't collect
      // a million zero-length segments when the patient is still.
      if (last && last.lat === point.lat && last.lng === point.lng) return prev;
      return [...prev.slice(-MAX_TRAIL + 1), point];
    });
  }, [user?.role, live, stale]);

  return useMemo(() => {
    if (user?.role !== "caregiver") return null;
    // Stale (patient offline) or no location (GPS revoked) → empty
    // analysis so the map drops the marker, polyline, and breadcrumb
    // dots. Same shape we return when no live snapshot has arrived
    // yet, so downstream rendering code doesn't need a separate
    // "was online, now offline" branch.
    const data = ((live?.data as LiveSnapshotData | undefined) ?? {});
    const loc = !stale && live ? data.location : null;
    if (!loc) return EMPTY_ANALYSIS;
    const tsRaw = live?.ts;
    const timestamp = typeof tsRaw === "string" ? new Date(tsRaw).getTime() : Date.now();
    return {
      ...EMPTY_ANALYSIS,
      latest: { lat: loc.lat, lng: loc.lng, timestamp },
      outOfBounds: !!data.outOfBounds,
      breadcrumbTrail: trail,
    };
  }, [user?.role, live, trail, stale]);
}
