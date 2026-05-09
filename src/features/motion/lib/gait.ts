import type { MotionSample } from "../../../types/app";
import { average, clamp, stdDev } from "../../../lib/utils";

export type GaitLabel =
  | "Calibrating"
  | "Normal"
  | "Irregular"
  | "High fall risk"
  | "Fall detected";

export interface GaitSignals {
  verticalLift: number;
  forwardConsistency: number;
  lateralDrift: number;
  impactSpike: number;
  postImpactStillness: number;
}

export interface GaitAnalysis {
  label: GaitLabel;
  color: string;
  zStd: number;
  yStd: number;
  xStd: number;
  fallDetected: boolean;
  riskScore: number;
  magnitudeAvg: number;
  magnitudeStd: number;
  peakMagnitude: number;
  signals: GaitSignals;
}

const RECENT_WINDOW = 150;
const MIN_SAMPLES = 30;
const FALL_PEAK_THRESHOLD = 6.5;
const FALL_STILLNESS_STD_THRESHOLD = 0.12;

const calibratingResult: GaitAnalysis = {
  label: "Calibrating",
  color: "text-cyan",
  zStd: 0,
  yStd: 0,
  xStd: 0,
  fallDetected: false,
  riskScore: 0.18,
  magnitudeAvg: 0,
  magnitudeStd: 0,
  peakMagnitude: 0,
  signals: {
    verticalLift: 0,
    forwardConsistency: 0,
    lateralDrift: 0,
    impactSpike: 0,
    postImpactStillness: 0,
  },
};

export function analyzeGait(samples: readonly MotionSample[]): GaitAnalysis {
  const recent = samples.slice(-RECENT_WINDOW);
  if (recent.length < MIN_SAMPLES) return calibratingResult;

  const xs = recent.map((s) => s.x);
  const ys = recent.map((s) => s.y);
  const zs = recent.map((s) => s.z);
  const mags = recent.map((s) => s.magnitude);

  const xStd = stdDev(xs);
  const yStd = stdDev(ys);
  const zStd = stdDev(zs);
  const magnitudeStd = stdDev(mags);
  const peakMagnitude = Math.max(...mags);

  const fallDetected = detectFallSignature(recent);
  const shuffling = zStd < 0.2 && yStd < 0.22 && xStd > 0.18;
  const irregular = !fallDetected && !shuffling && zStd < 0.45;

  const signals: GaitSignals = {
    verticalLift: clamp((0.24 - zStd) / 0.24, 0, 1),
    forwardConsistency: clamp((0.26 - yStd) / 0.26, 0, 1),
    lateralDrift: clamp((xStd - 0.1) / 0.28, 0, 1),
    impactSpike: clamp((peakMagnitude - 3.5) / 3.2, 0, 1),
    postImpactStillness: clamp((0.16 - magnitudeStd) / 0.16, 0, 1),
  };

  const baseRisk = clamp(
    0.12 +
      signals.verticalLift * 0.22 +
      signals.forwardConsistency * 0.16 +
      signals.lateralDrift * 0.28 +
      signals.impactSpike * 0.12 +
      signals.postImpactStillness * 0.1,
    0.12,
    0.92,
  );

  let label: GaitLabel = "Normal";
  let color = "text-emerald-300";
  let riskScore = baseRisk;

  if (fallDetected) {
    label = "Fall detected";
    color = "text-signal";
    riskScore = 0.98;
  } else if (shuffling || baseRisk >= 0.72) {
    label = "High fall risk";
    color = "text-amber-300";
    riskScore = Math.max(baseRisk, 0.78);
  } else if (irregular || baseRisk >= 0.46) {
    label = "Irregular";
    color = "text-cyan";
    riskScore = Math.max(baseRisk, 0.54);
  }

  return {
    label,
    color,
    zStd,
    yStd,
    xStd,
    magnitudeAvg: average(mags),
    magnitudeStd,
    peakMagnitude,
    fallDetected,
    riskScore,
    signals,
  };
}

/**
 * Look for an acceleration spike followed by a low-variance "still" tail.
 * Classic signature of a fall: impact then motionlessness.
 */
function detectFallSignature(samples: readonly MotionSample[]): boolean {
  for (let i = 8; i < samples.length - 24; i++) {
    const sample = samples[i];
    if (!sample || sample.magnitude <= FALL_PEAK_THRESHOLD) continue;
    const tail = samples.slice(i + 1, i + 26);
    if (tail.length === 0) continue;
    const tailStd = stdDev(tail.map((s) => s.magnitude));
    if (tailStd < FALL_STILLNESS_STD_THRESHOLD) return true;
  }
  return false;
}
