import { useEffect, useRef } from "react";

import type { GaitAnalysis } from "../features/motion/lib/gait";
import type { VisionMetrics } from "../features/vision/types";
import { formatMeters } from "../lib/utils";
import type { AlertInput, GameSession, LocationAnalysis, SafeZone } from "../types/app";
import { average } from "../lib/utils";

interface AlertOrchestrationProps {
  addAlert: (alert: AlertInput) => void;
  locationAnalysis: LocationAnalysis;
  gait: GaitAnalysis;
  visionMetrics: VisionMetrics;
  safeZone: SafeZone;
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
  safeZone,
}: AlertOrchestrationProps) {
  const guardRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const guard = guardRef.current;
    const checks: Array<{ key: string; active: boolean; payload: AlertInput }> = [
      {
        key: "geofence",
        active: locationAnalysis.outOfBounds,
        payload: {
          module: "Location",
          severity: "danger",
          title: "Out-of-bounds excursion",
          message: `Patient is ${formatMeters(locationAnalysis.currentDistance)} from ${safeZone.name}. Sending caregiver escalation.`,
          dedupeKey: "geofence",
        },
      },
      {
        key: "dwelling",
        active: locationAnalysis.dwelling.active,
        payload: {
          module: "Location",
          severity: "danger",
          title: "Dwelling / lost anomaly",
          message: `Patient remained in a ${Math.round(
            locationAnalysis.dwelling.diagonal,
          )} meter box outside the safe zone for ${Math.round(
            locationAnalysis.dwelling.duration / 60000,
          )} minutes.`,
          dedupeKey: "dwelling",
        },
      },
      {
        key: "fall",
        active: gait.fallDetected,
        payload: {
          module: "Gait",
          severity: "danger",
          title: "Fall signature detected",
          message: "Acceleration spike followed by motionlessness. Check patient immediately.",
          dedupeKey: "fall",
        },
      },
      {
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
      },
    ];

    for (const check of checks) {
      if (check.active && !guard[check.key]) {
        addAlert(check.payload);
      }
      guard[check.key] = check.active;
    }
  }, [addAlert, gait, locationAnalysis, safeZone.name]);

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

  const finalized = history.filter((entry) => entry.status !== "checkpoint" && entry.id !== session.id);
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
