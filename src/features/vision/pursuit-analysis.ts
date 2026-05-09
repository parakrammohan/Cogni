/**
 * Smooth-pursuit eye-movement analysis.
 *
 * Inputs are two time-stamped paths in 0..100 normalized canvas coordinates:
 *   - target: where we asked the user to look (sampled at RAF rate ~60Hz)
 *   - gaze:   where the iris actually was   (sampled at vision-loop rate ~7Hz)
 *
 * Metrics produced:
 *   - gain:        mean eye velocity / mean target velocity
 *                  (1.0 = perfect tracking; <0.8 typical of MCI/AD)
 *   - accuracy:    100 - mean Euclidean distance between paired samples
 *   - saccadeRate: gaze-velocity spikes per second
 *                  (>30°/s in real eyes; we use a normalized threshold)
 *   - latency:     phase-shift between target and gaze around the test centroid,
 *                  converted to milliseconds via the target's angular velocity.
 *
 * All in normalized canvas space (0..100 %), so the caller doesn't have to know
 * pixel sizes or DPI.
 */

export interface PathPoint {
  x: number;
  y: number;
  /** ms timestamp (Date.now or performance.now — be consistent across one run) */
  time: number;
}

export interface PursuitResult {
  /** mean(|eye velocity|) / mean(|target velocity|). Ideal ≈ 1.0 */
  gain: number;
  /** 0..100 — higher = closer tracking */
  accuracy: number;
  /** saccades per second */
  saccadeRate: number;
  /** ms behind the target — positive means the eye lags */
  latency: number;
  /** Risk classification */
  risk: "Low" | "Moderate" | "High";
}

/** Velocity threshold (% / second) above which we call a sample "saccadic". */
const SACCADE_VELOCITY_THRESHOLD = 80;

/** Minimum samples for a meaningful result. */
const MIN_GAZE_SAMPLES = 8;

export function analyzePursuit(
  target: ReadonlyArray<PathPoint>,
  gaze: ReadonlyArray<PathPoint>,
  durationMs: number,
): PursuitResult {
  if (gaze.length < MIN_GAZE_SAMPLES || target.length < 2) {
    return { gain: 0, accuracy: 0, saccadeRate: 0, latency: 0, risk: "Low" };
  }

  const eyeVelocities = pointwiseSpeed(gaze);
  const targetVelocities = pointwiseSpeed(target);
  const meanEye = mean(eyeVelocities);
  const meanTarget = mean(targetVelocities);

  // Cap gain at 1.5 so an erratic eye doesn't produce nonsense values.
  const gainRaw = meanTarget > 0 ? meanEye / meanTarget : 0;
  const gain = clamp(gainRaw, 0, 2);

  // Accuracy: average distance from target → percent
  let totalDistance = 0;
  let pairs = 0;
  for (const point of gaze) {
    const closest = closestInTime(target, point.time);
    if (!closest) continue;
    totalDistance += Math.hypot(point.x - closest.x, point.y - closest.y);
    pairs += 1;
  }
  const meanDistance = pairs > 0 ? totalDistance / pairs : 100;
  const accuracy = clamp(100 - meanDistance, 0, 100);

  // Saccade detection on velocity series
  const saccadeFrames = countSpikes(gaze, SACCADE_VELOCITY_THRESHOLD);
  const durationSec = durationMs / 1000;
  const saccadeRate = durationSec > 0 ? saccadeFrames / durationSec : 0;

  // Latency from phase shift around the test centroid
  const latency = phaseLatencyMs(target, gaze);

  const risk = classifyPursuit({ gain, accuracy, saccadeRate, latency });

  return { gain, accuracy, saccadeRate, latency, risk };
}

function pointwiseSpeed(path: ReadonlyArray<PathPoint>): number[] {
  const speeds: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const dt = (b.time - a.time) / 1000;
    if (dt <= 0) continue;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    speeds.push(dist / dt);
  }
  return speeds;
}

function countSpikes(path: ReadonlyArray<PathPoint>, threshold: number): number {
  // Count discrete velocity spike "bursts" — consecutive over-threshold frames
  // count as one saccade so a single fast movement isn't double-counted.
  let count = 0;
  let inBurst = false;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const dt = (b.time - a.time) / 1000;
    if (dt <= 0) continue;
    const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;
    if (speed > threshold) {
      if (!inBurst) {
        count += 1;
        inBurst = true;
      }
    } else {
      inBurst = false;
    }
  }
  return count;
}

/**
 * Phase-shift latency for circular target motion.
 *
 *   1. Treat the test as motion around the canvas centroid (50, 50).
 *   2. For paired (target, gaze) samples, compute the angular difference.
 *   3. Median of those differences = constant phase shift caused by tracking lag.
 *   4. Convert phase shift back to time using the target's mean angular velocity.
 *
 * Returns 0 if there isn't enough data to estimate.
 */
function phaseLatencyMs(
  target: ReadonlyArray<PathPoint>,
  gaze: ReadonlyArray<PathPoint>,
): number {
  if (target.length < 4 || gaze.length < 4) return 0;

  // Mean angular velocity of the target (rad/s)
  const angles = target.map((p) => Math.atan2(p.y - 50, p.x - 50));
  let totalDelta = 0;
  let totalDt = 0;
  for (let i = 1; i < target.length; i++) {
    const prev = target[i - 1];
    const curr = target[i];
    const a0 = angles[i - 1];
    const a1 = angles[i];
    if (!prev || !curr || a0 === undefined || a1 === undefined) continue;
    const dt = (curr.time - prev.time) / 1000;
    if (dt <= 0) continue;
    let da = a1 - a0;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    totalDelta += Math.abs(da);
    totalDt += dt;
  }
  const angularVelocity = totalDt > 0 ? totalDelta / totalDt : 0;
  if (angularVelocity === 0) return 0;

  // Phase differences for each gaze sample vs the closest target.
  const phaseDiffs: number[] = [];
  for (const point of gaze) {
    const closest = closestInTime(target, point.time);
    if (!closest) continue;
    const tAngle = Math.atan2(closest.y - 50, closest.x - 50);
    const gAngle = Math.atan2(point.y - 50, point.x - 50);
    let diff = tAngle - gAngle;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    phaseDiffs.push(diff);
  }
  if (!phaseDiffs.length) return 0;

  // Median is robust against the occasional saccade spike.
  const median = medianOf(phaseDiffs);
  return Math.abs(median / angularVelocity) * 1000;
}

function classifyPursuit({
  gain,
  accuracy,
  saccadeRate,
  latency,
}: {
  gain: number;
  accuracy: number;
  saccadeRate: number;
  latency: number;
}): PursuitResult["risk"] {
  let score = 0;
  // Reduced or excessive gain
  if (gain < 0.7 || gain > 1.3) score += 2;
  else if (gain < 0.85 || gain > 1.15) score += 1;
  // Many saccades
  if (saccadeRate > 1.5) score += 2;
  else if (saccadeRate > 0.8) score += 1;
  // Poor tracking
  if (accuracy < 55) score += 2;
  else if (accuracy < 75) score += 1;
  // High latency
  if (latency > 280) score += 1;

  if (score >= 4) return "High";
  if (score >= 2) return "Moderate";
  return "Low";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[mid - 1];
    const right = sorted[mid];
    if (left === undefined || right === undefined) return 0;
    return (left + right) / 2;
  }
  return sorted[mid] ?? 0;
}

function closestInTime(
  path: ReadonlyArray<PathPoint>,
  time: number,
): PathPoint | null {
  if (!path.length) return null;
  let best = path[0]!;
  let bestDiff = Math.abs(best.time - time);
  for (const point of path) {
    const diff = Math.abs(point.time - time);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = point;
    }
  }
  return best;
}

export interface StoredPursuitResult extends PursuitResult {
  id: string;
  createdAt: number;
}
