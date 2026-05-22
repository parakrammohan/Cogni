/**
 * Caregiver-side alert orchestration.
 *
 * The patient-side `useAlertOrchestration` runs on the patient's own
 * sensor outputs and fires alerts on the patient's device — useful if
 * the patient is also looking at the app, less so for the caregiver
 * dashboard. This hook is the caregiver analogue: it watches the
 * patient's *live WebSocket-streamed* state (location, gait) and the
 * caregiver's own geofence config, and emits alerts that surface on
 * the caregiver's bell / Alerts scene.
 *
 * Dedupe strategy — designed to keep the bell quiet:
 *   1. **Transition gate.** An alert only fires on the inactive→active
 *      edge for a given key. Holding the condition steady (patient
 *      stays outside the zone for an hour) produces exactly one alert.
 *   2. **Cooldown.** Even on a true new edge, a given key can't refire
 *      within COOLDOWN_MS of its previous fire. So a patient hovering
 *      on the geofence boundary that flips in/out repeatedly still
 *      only generates one alert every five minutes.
 *
 * Together those two rules mean a meaningful event lands once, then
 * the panel stays quiet until something genuinely changes.
 */

import { useEffect, useRef } from "react";

import { pointInPolygon, type GeofenceSettings } from "../features/location/lib/geofence";
import type { GaitAnalysis } from "../features/motion/lib/gait";
import type { AlertInput } from "../types/app";

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

interface UseCaregiverAlertsOptions {
  addAlert: (alert: AlertInput) => void;
  /** Patient's live lat/lng from the WS feed, or null when offline. */
  liveLocation: { lat: number; lng: number } | null;
  /** Patient's full gait analysis from the WS feed, or null when offline. */
  liveGait: GaitAnalysis | null;
  /** Caregiver-drawn zones (lives in caregiver localStorage). */
  geofence: GeofenceSettings;
  /** Don't fire any alerts when the patient isn't online — the data
   *  feeding the checks is stale by definition. */
  patientOnline: boolean;
}

export function useCaregiverAlerts({
  addAlert,
  liveLocation,
  liveGait,
  geofence,
  patientOnline,
}: UseCaregiverAlertsOptions): void {
  // Per-key: whether the condition was last seen active (transition
  // gate) and when it last fired (cooldown). One ref so the two pieces
  // stay in lockstep without extra re-renders.
  const stateRef = useRef<Map<string, { active: boolean; lastFiredAt: number }>>(new Map());

  useEffect(() => {
    if (!patientOnline) return;

    const checks: Array<{ key: string; active: boolean; payload: AlertInput }> = [];

    // Outside every safe zone. Fires regardless of per-zone alertModes
    // — leaving every drawn polygon is THE safety signal the caregiver
    // cares about, and gating it behind a "tap exit on each zone"
    // checkbox lost too many demos to misconfiguration.
    if (liveLocation && geofence.zones.length > 0) {
      const insideAny = geofence.zones.some((z) => pointInPolygon(liveLocation, z.polygon));
      checks.push({
        key: "outside-safe-zone",
        active: !insideAny,
        payload: {
          module: "Location",
          severity: "danger",
          title: "Patient outside every safe zone",
          message: `Last seen position is not inside any of the ${geofence.zones.length} configured ${
            geofence.zones.length === 1 ? "zone" : "zones"
          }. Open Map to see the breadcrumb.`,
          dedupeKey: "outside-safe-zone",
        },
      });
    }

    // Gait fall signature — accel spike + post-impact stillness on the
    // patient device. Highest-severity gait signal.
    if (liveGait) {
      checks.push({
        key: "fall",
        active: !!liveGait.fallDetected,
        payload: {
          module: "Gait",
          severity: "danger",
          title: "Fall signature detected",
          message: "Acceleration spike followed by motionlessness on the patient device. Check on them immediately.",
          dedupeKey: "fall",
        },
      });
      checks.push({
        key: "high-fall-risk",
        active: liveGait.label === "High fall risk",
        payload: {
          module: "Gait",
          severity: "warning",
          title: "Elevated fall risk",
          message: `Gait analysis: ${liveGait.label}. Risk score ${(liveGait.riskScore * 100).toFixed(0)}%.`,
          dedupeKey: "high-fall-risk",
        },
      });
    }

    const now = Date.now();
    const state = stateRef.current;
    for (const check of checks) {
      const prev = state.get(check.key) ?? { active: false, lastFiredAt: 0 };
      const transitioned = check.active && !prev.active;
      const cooldownPassed = now - prev.lastFiredAt > COOLDOWN_MS;
      if (transitioned && cooldownPassed) {
        addAlert(check.payload);
        state.set(check.key, { active: true, lastFiredAt: now });
      } else {
        // Track active state even when we don't fire, so a later
        // inactive→active edge is detectable.
        state.set(check.key, { active: check.active, lastFiredAt: prev.lastFiredAt });
      }
    }
  }, [addAlert, liveLocation, liveGait, geofence, patientOnline]);
}
