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

import type { GaitAnalysis, GaitSignals } from "../features/motion/lib/gait";
import { useAuth } from "../auth/AuthContext";
import { useSubjectPatient } from "./useSubjectPatient";
import { useLiveStream } from "../ws/useLiveStream";

const SNAPSHOT_FRESHNESS_MS = 10_000;

interface LiveSnapshotData {
  gait?: Partial<GaitAnalysis>;
}

const EMPTY_SIGNALS: GaitSignals = {
  verticalLift: 0,
  forwardConsistency: 0,
  lateralDrift: 0,
  impactSpike: 0,
  postImpactStillness: 0,
};

const EMPTY_GAIT: GaitAnalysis = {
  label: "No data",
  color: "text-slate-500",
  zStd: 0,
  yStd: 0,
  xStd: 0,
  fallDetected: false,
  riskScore: 0,
  magnitudeAvg: 0,
  magnitudeStd: 0,
  peakMagnitude: 0,
  signals: EMPTY_SIGNALS,
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
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
    const g = data.gait;
    if (!g || typeof g !== "object") return null;
    // Always return a fully-shaped GaitAnalysis so GaitScene's
    // .toFixed() calls can't blow up on a missing field. Merge
    // whatever the patient sent over a known-good empty default —
    // an older patient client that only publishes { label, riskScore }
    // will still produce a valid object (the missing numeric fields
    // just show 0 until the patient reloads).
    const incomingSignals = g.signals && typeof g.signals === "object" ? g.signals : {};
    return {
      label: typeof g.label === "string" ? (g.label as GaitAnalysis["label"]) : EMPTY_GAIT.label,
      color: typeof g.color === "string" ? g.color : EMPTY_GAIT.color,
      zStd: num(g.zStd, 0),
      yStd: num(g.yStd, 0),
      xStd: num(g.xStd, 0),
      fallDetected: typeof g.fallDetected === "boolean" ? g.fallDetected : false,
      riskScore: num(g.riskScore, 0),
      magnitudeAvg: num(g.magnitudeAvg, 0),
      magnitudeStd: num(g.magnitudeStd, 0),
      peakMagnitude: num(g.peakMagnitude, 0),
      signals: {
        verticalLift: num((incomingSignals as Partial<GaitSignals>).verticalLift, 0),
        forwardConsistency: num((incomingSignals as Partial<GaitSignals>).forwardConsistency, 0),
        lateralDrift: num((incomingSignals as Partial<GaitSignals>).lateralDrift, 0),
        impactSpike: num((incomingSignals as Partial<GaitSignals>).impactSpike, 0),
        postImpactStillness: num((incomingSignals as Partial<GaitSignals>).postImpactStillness, 0),
      },
    };
  }, [user?.role, live, stale]);
}
