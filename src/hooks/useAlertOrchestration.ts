import { useEffect, useRef } from "react";

import type { GeofenceSettings, WanderingAnalysis } from "../features/location/lib/geofence";
import { pointInPolygon } from "../features/location/lib/geofence";
import type { GaitAnalysis } from "../features/motion/lib/gait";
import type { VisionMetrics } from "../features/vision/types";
import type { AlertInput, GameSession, LocationAnalysis } from "../types/app";
import { average } from "../lib/utils";

interface AlertOrchestrationProps {
  addAlert: (alert: AlertInput) => void;
  locationAnalysis: LocationAnalysis;
  gait: GaitAnalysis;
  visionMetrics: VisionMetrics;
  geofence: GeofenceSettings;
  wandering: WanderingAnalysis;
}

/**
 * Watches sensor outputs and emits dedupe'd alerts when anomalies cross thresholds.
 * The dedupe guard prevents the same condition from firing alerts on every render.
 */
export function useAlertOrchestration({
  addAlert,
  locationAnalysis,
  gait,
  visionMetrics,
  geofence,
  wandering,
}: AlertOrchestrationProps) {
  const guardRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const guard = guardRef.current;
    const checks: Array<{ key: string; active: boolean; payload: AlertInput }> = [];

    // Per-zone "exit" + "dwelling" alerts. No fallback to a legacy
    // circular safe zone — if the caregiver hasn't drawn any polygons,
    // there's no out-of-bounds notion at all and we don't manufacture
    // one from a hardcoded Singapore default. The caregiver geofence
    // panel surfaces the empty state ("Add polygon" / "Add circle").
    const latest = locationAnalysis.latest;
    if (geofence.zones.length > 0 && latest) {
      const exitZones = geofence.zones.filter((z) => z.alertModes.includes("exit"));
      const stillInsideAtLeastOne = exitZones.some((z) => pointInPolygon(latest, z.polygon));
      if (exitZones.length > 0) {
        checks.push({
          key: "exit",
          active: !stillInsideAtLeastOne,
          payload: {
            module: "Location",
            severity: "danger",
            title: "Patient left the safe zone",
            message: `Patient is outside ${
              exitZones.length === 1
                ? exitZones[0]!.name
                : `all ${exitZones.length} exit-armed zones`
            }.`,
            dedupeKey: "exit",
          },
        });
      }
      for (const zone of geofence.zones) {
        if (!zone.alertModes.includes("dwelling")) continue;
        // Home is the one place the patient is supposed to be at rest.
        // Skip dwelling alerts for any zone the caregiver has marked
        // as home — otherwise sitting on the couch fires "Dwelling in
        // Home" after every DWELLING_WINDOW_MS.
        if (zone.isHome) continue;
        const inside = pointInPolygon(latest, zone.polygon);
        checks.push({
          key: `dwelling-${zone.id}`,
          active: locationAnalysis.dwelling.active && inside,
          payload: {
            module: "Location",
            severity: "warning",
            title: `Dwelling in ${zone.name}`,
            message: `Patient stopped moving in ${zone.name} for ${Math.round(
              locationAnalysis.dwelling.duration / 60000,
            )} min.`,
            dedupeKey: `dwelling-${zone.id}`,
          },
        });
      }
    }

    // Global wandering alert (independent of zones).
    checks.push({
      key: "wandering",
      active: geofence.wanderingEnabled && wandering.active,
      payload: {
        module: "Location",
        severity: "warning",
        title: "Wandering pattern detected",
        message: `Patient covered ${Math.round(wandering.pathLength)} m with tortuosity ${wandering.tortuosity.toFixed(
          1,
        )} (path/displacement). Movement looks aimless.`,
        dedupeKey: "wandering",
      },
    });

    checks.push({
      key: "fall",
      active: gait.fallDetected,
      payload: {
        module: "Gait",
        severity: "danger",
        title: "Fall signature detected",
        message: "Acceleration spike followed by motionlessness. Check patient immediately.",
        dedupeKey: "fall",
      },
    });
    checks.push({
      key: "shuffle",
      active: gait.label === "High fall risk",
      payload: {
        module: "Gait",
        severity: "warning",
        title: "Shuffling gait pattern",
        message:
          "Reduced vertical oscillation and unstable lateral movement suggest elevated fall risk.",
        dedupeKey: "shuffle",
      },
    });

    for (const check of checks) {
      if (check.active && !guard[check.key]) {
        addAlert(check.payload);
      }
      guard[check.key] = check.active;
    }
  }, [addAlert, gait, locationAnalysis, geofence, wandering]);

  useEffect(() => {
    if (visionMetrics.risk === "High" && !guardRef.current.vision) {
      addAlert({
        module: "Vision",
        severity: "warning",
        title: "High ocular latency",
        message: `Saccadic latency ${visionMetrics.latency}ms with fixation ${visionMetrics.fixation}%. Review diagnostic drift.`,
        dedupeKey: "vision-high-risk",
      });
      guardRef.current.vision = true;
    }
    if (visionMetrics.risk !== "High") {
      guardRef.current.vision = false;
    }
  }, [addAlert, visionMetrics]);
}

interface CognitionAlertProps {
  addAlert: (alert: AlertInput) => void;
  history: GameSession[];
}

/**
 * Compares a newly recorded session against the rolling baseline and either logs
 * an info alert (steady) or warns of a meaningful decline.
 */
export function compareCognitionSession(
  session: GameSession,
  history: GameSession[],
  addAlert: (alert: AlertInput) => void,
) {
  if (session.status === "checkpoint") return;

  const finalized = history.filter(
    (entry) => entry.status !== "checkpoint" && entry.id !== session.id,
  );
  if (!finalized.length) {
    addAlert({
      module: "Cognition",
      severity: "info",
      title: "First session logged",
      message: `Memory span ${session.memorySpan} recorded. Future sessions will compare against this baseline.`,
      dedupeKey: `session-${session.id}`,
    });
    return;
  }

  const baseline = {
    memorySpan: average(finalized.map((entry) => entry.memorySpan)),
    avgReaction: average(finalized.map((entry) => entry.avgReaction || 0)),
  };

  const declined =
    session.memorySpan <= baseline.memorySpan - 1 ||
    session.avgReaction >= baseline.avgReaction * 1.2;

  if (declined) {
    addAlert({
      module: "Cognition",
      severity: "warning",
      title: "Cognitive decline signal",
      message: `Span ${session.memorySpan} vs baseline ${baseline.memorySpan.toFixed(
        1,
      )}; reaction ${Math.round(session.avgReaction)}ms vs baseline ${Math.round(baseline.avgReaction)}ms.`,
      dedupeKey: `cognition-${session.id}`,
    });
  } else {
    addAlert({
      module: "Cognition",
      severity: "info",
      title: "Assessment session logged",
      message: `Memory span ${session.memorySpan} recorded with average reaction ${Math.round(session.avgReaction)}ms.`,
      dedupeKey: `session-${session.id}`,
    });
  }
}

// Stop unused warning when imports change order in future
export type { CognitionAlertProps };
