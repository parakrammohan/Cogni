/**
 * Smooth-pursuit eye-movement analysis.
 *
 * Inputs are two time-stamped paths in 0..100 normalized canvas coordinates:
 *   - target: where we asked the user to look (sampled at RAF rate ~60Hz)
 *   - gaze:   where the iris actually was   (sampled at vision-loop rate ~7Hz)
 *
 * Metrics produced:
 *   - gain:        slow-phase eye velocity / target velocity, computed only over
 *                  non-saccadic gaze samples (saccade spikes inflate naïve gain).
 *                  1.0 = perfect tracking; <0.8 typical of MCI/AD pursuit deficit.
 *   - accuracy:    100 − trimmed-mean Euclidean distance between paired samples.
 *                  Drops the worst 10% so a single saccade or blink-extrapolated
 *                  outlier doesn't tank the score.
 *   - saccadeRate: gaze-velocity spikes per second. Threshold scales with target
 *                  velocity (3× target speed) so it adapts to test difficulty.
 *   - latency:     phase-shift between target and gaze around the test centroid,
 *                  converted to milliseconds via the target's angular velocity.
 *                  Signed: positive = eye lags target; negative = anticipatory.
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
  /** slow-phase mean(|eye velocity|) / mean(|target velocity|). Ideal ≈ 1.0 */
  gain: number;
  /** 0..100 — higher = closer tracking. Trimmed mean (top 10% dropped). */
  accuracy: number;
  /** saccades per second */
  saccadeRate: number;
  /** ms of phase shift; positive = eye lags target, negative = anticipatory */
  latency: number;
  /** Risk classification */
  risk: "Low" | "Moderate" | "High";
}

/** A saccade is a velocity spike at >SACCADE_VELOCITY_MULTIPLE × target velocity. */
const SACCADE_VELOCITY_MULTIPLE = 3;

/** Floor for the saccade threshold so noise on a still gaze doesn't trigger. */
const SACCADE_VELOCITY_FLOOR = 60;

/** Minimum samples for a meaningful result. */
const MIN_GAZE_SAMPLES = 8;

/** Fraction of worst-distance pairs to drop before computing accuracy. */
const ACCURACY_TRIM_FRAC = 0.1;

export function analyzePursuit(
  target: ReadonlyArray<PathPoint>,
  gaze: ReadonlyArray<PathPoint>,
  durationMs: number,
): PursuitResult {
  if (gaze.length < MIN_GAZE_SAMPLES || target.length < 2) {
    return { gain: 0, accuracy: 0, saccadeRate: 0, latency: 0, risk: "Low" };
  }

  // Velocity series (per-segment magnitudes in %/sec).
  const eyeSpeeds = pointwiseSpeed(gaze);
  const targetSpeeds = pointwiseSpeed(target);
  const meanTargetSpeed = mean(targetSpeeds);

  // Saccade threshold adapts to target velocity, with a noise floor.
  const saccadeThreshold = Math.max(
    SACCADE_VELOCITY_FLOOR,
    SACCADE_VELOCITY_MULTIPLE * meanTargetSpeed,
  );

  // Saccade rate from burst counts (consecutive over-threshold frames = 1 burst).
  const saccadeBursts = countSpikes(gaze, saccadeThreshold);
  const durationSec = durationMs / 1000;
  const saccadeRate = durationSec > 0 ? saccadeBursts / durationSec : 0;

  // Gain over slow-phase samples only — the standard definition in clinical
  // pursuit research. Saccadic frames are dropped so a single fast catch-up
  // movement doesn't bias gain upward.
  const slowPhaseSpeeds = eyeSpeeds.filter((v) => v <= saccadeThreshold);
  const slowPhaseMean = slowPhaseSpeeds.length > 0 ? mean(slowPhaseSpeeds) : mean(eyeSpeeds);
  const gainRaw = meanTargetSpeed > 0 ? slowPhaseMean / meanTargetSpeed : 0;
  const gain = clamp(gainRaw, 0, 2);

  // Accuracy: trimmed mean of Euclidean distances between paired samples.
  const distances: number[] = [];
  for (const point of gaze) {
    const closest = closestInTime(target, point.time);
    if (!closest) continue;
    distances.push(Math.hypot(point.x - closest.x, point.y - closest.y));
  }
  const meanDistance = trimmedMean(distances, ACCURACY_TRIM_FRAC);
  const accuracy = clamp(100 - meanDistance, 0, 100);

  // Latency from phase shift around the test centroid. Signed.
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
 * Returns a signed value (positive = eye lags target, negative = anticipatory).
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
    // Track signed angular velocity so sign of latency is meaningful.
    totalDelta += da;
    totalDt += dt;
  }
  const angularVelocity = totalDt > 0 ? totalDelta / totalDt : 0;
  if (angularVelocity === 0) return 0;

  // Phase differences for each gaze sample vs the closest target.
  // diff = target - gaze: positive when target is ahead of gaze (eye lagging).
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

  // Median is robust against the occasional saccade spike. Sign of the
  // result depends on the sign of angularVelocity (CCW vs CW motion).
  const median = medianOf(phaseDiffs);
  return (median / angularVelocity) * 1000;
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
  // High absolute latency (anticipation or lag both bad past ±280ms)
  if (Math.abs(latency) > 280) score += 1;

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

/**
 * Trimmed mean: drops the worst `frac` fraction of the largest values before
 * averaging. Robust against single saccade or blink-extrapolated outliers.
 */
function trimmedMean(values: number[], frac: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const drop = Math.floor(sorted.length * frac);
  const kept = drop > 0 ? sorted.slice(0, sorted.length - drop) : sorted;
  return mean(kept);
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
  // Path is time-ordered; binary search for the timestamp, then check the two
  // neighbours to find the actual closest. O(log n) instead of O(n).
  let lo = 0;
  let hi = path.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midTime = path[mid]!.time;
    if (midTime < time) lo = mid + 1;
    else hi = mid;
  }
  const candidate = path[lo]!;
  if (lo === 0) return candidate;
  const prev = path[lo - 1]!;
  return Math.abs(candidate.time - time) < Math.abs(prev.time - time) ? candidate : prev;
}

export interface StoredPursuitResult extends PursuitResult {
  id: string;
  createdAt: number;
}
