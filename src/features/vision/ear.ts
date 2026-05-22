import type { OcularRisk } from "./types";

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

/**
 * Absolute EAR floor used as a backstop. A face whose open-eye EAR sits
 * around ~0.30 will trip blinks well before this; this is here so a
 * truly closed eye on a narrow-eyed user (open baseline ≈ 0.24) still
 * triggers regardless of relative scaling.
 */
export const EAR_BLINK_THRESHOLD = 0.24;
/**
 * Adaptive threshold: a blink also fires when the current EAR drops to
 * this fraction of the recent open-eye baseline. Captures the "EAR
 * dipped meaningfully from where it usually sits" pattern that's
 * robust to individual eye geometry, lighting, and camera angle.
 * Raised to 0.86 to be more sensitive — even a partial blink that
 * only drops EAR ~14% from the running max now registers.
 */
export const EAR_BLINK_DROP_FRACTION = 0.86;
/** Samples used to estimate the open-eye baseline (rolling max). */
export const EAR_BASELINE_WINDOW = 90;
/** Frames the eye must stay closed before counting a blink.
 *  1 = single sub-frame dip is enough — catches very quick blinks at
 *  the cost of occasional false positives from a downward glance. */
export const BLINK_CONSEC_FRAMES = 1;

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Compute the 6-point Eye Aspect Ratio for one eye.
 * Returns 0 if the horizontal eye width is degenerate.
 */
export function computeEar(
  landmarks: readonly NormalizedLandmark[],
  indices: readonly [number, number, number, number, number, number],
): number {
  const [i1, i2, i3, i4, i5, i6] = indices;
  const p1 = landmarks[i1];
  const p2 = landmarks[i2];
  const p3 = landmarks[i3];
  const p4 = landmarks[i4];
  const p5 = landmarks[i5];
  const p6 = landmarks[i6];
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;

  const horizontal = distance(p1, p4);
  if (horizontal < 1e-6) return 0;
  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
}

/**
 * Stateful blink detector with temporal hysteresis and a sliding-window blink rate.
 *
 * Blink registration:
 *   A blink is counted when EAR stays below EAR_BLINK_THRESHOLD for
 *   BLINK_CONSEC_FRAMES consecutive frames. The detector then waits for EAR to
 *   recover before another blink can be counted.
 *
 * Blink rate:
 *   Computed over a sliding 60-second window. Until the detector has been alive
 *   for at least WARMUP_MS, we extrapolate (count * 60_000 / elapsed) so the UI
 *   shows a meaningful number from the first blink instead of waiting a full minute.
 */
const RATE_WINDOW_MS = 60_000;
const WARMUP_MS = 15_000;

export class BlinkDetector {
  private consecutiveLowFrames = 0;
  private inBlink = false;
  private blinkTimestamps: number[] = [];
  private lastBlinkAt = 0;
  private readonly startedAt = performance.now();
  // Rolling window of recent EAR samples; the max of this window is
  // our running "open-eye baseline". We use max-of-window rather than
  // a mean because the mean gets dragged down every time the user
  // blinks, which is exactly the wrong direction. Truncated when the
  // EAR is part of a blink (see currentThreshold()) so a long-closed
  // eye doesn't poison the baseline.
  private earSamples: number[] = [];

  /** Push a new EAR sample. Returns true if a blink was just registered. */
  tick(ear: number): boolean {
    const now = performance.now();
    // Trim timestamps older than the rolling window.
    while (this.blinkTimestamps.length > 0) {
      const oldest = this.blinkTimestamps[0];
      if (oldest === undefined || now - oldest <= RATE_WINDOW_MS) break;
      this.blinkTimestamps.shift();
    }

    // Maintain the open-eye baseline. We only feed the buffer when the
    // EAR is well above the absolute floor — otherwise a sustained
    // closed-eye would drag the baseline down and progressively numb
    // the detector. A floor of EAR_BLINK_THRESHOLD + 0.02 (≈0.24) is a
    // conservative "this sample is definitely an open eye" line.
    if (ear >= EAR_BLINK_THRESHOLD + 0.02) {
      this.earSamples.push(ear);
      if (this.earSamples.length > EAR_BASELINE_WINDOW) this.earSamples.shift();
    }

    if (ear < this.currentThreshold()) {
      this.consecutiveLowFrames += 1;
      if (this.consecutiveLowFrames >= BLINK_CONSEC_FRAMES && !this.inBlink) {
        this.inBlink = true;
        this.blinkTimestamps.push(now);
        this.lastBlinkAt = now;
        return true;
      }
    } else {
      this.consecutiveLowFrames = 0;
      this.inBlink = false;
    }
    return false;
  }

  /** The effective blink threshold for the current frame.
   *  Picks the *larger* of (a) the absolute floor and (b) baseline *
   *  drop fraction, so a wide-open-eyed user fires at a proportionally
   *  higher cutoff while a narrow-eyed user is still caught by the
   *  floor. Clamped to a sane upper bound so a single high EAR
   *  spike (e.g. a wide stare) doesn't make every subsequent frame
   *  look like a blink. */
  private currentThreshold(): number {
    if (this.earSamples.length < 8) return EAR_BLINK_THRESHOLD;
    let max = 0;
    for (const e of this.earSamples) if (e > max) max = e;
    const adaptive = max * EAR_BLINK_DROP_FRACTION;
    const floor = EAR_BLINK_THRESHOLD;
    return Math.min(0.32, Math.max(floor, adaptive));
  }

  /** Whether the eye is currently mid-blink (closed). */
  get isBlinking(): boolean {
    return this.inBlink;
  }

  /** Blinks counted in the rolling 60-second window. */
  get count(): number {
    return this.blinkTimestamps.length;
  }

  /**
   * Blinks per minute. After WARMUP_MS, this is just the count in the rolling
   * 60-second window. Before that, we extrapolate so the UI updates immediately.
   */
  get rate(): number {
    const elapsed = performance.now() - this.startedAt;
    if (elapsed < WARMUP_MS) {
      return elapsed > 0 ? (this.blinkTimestamps.length * RATE_WINDOW_MS) / elapsed : 0;
    }
    return this.blinkTimestamps.length;
  }

  /** ms since the last blink, capped at 9999. 0 if no blink yet. */
  get latency(): number {
    if (!this.lastBlinkAt) return 0;
    return Math.min(performance.now() - this.lastBlinkAt, 9999);
  }
}

/**
 * Risk heuristic based on blink rate, EAR variance, and average EAR.
 *
 * Clinical reference: normal adult blink rate is 10-20 blinks/min;
 * Parkinson's / dementia populations show extreme values (<5 or >40) plus
 * erratic patterns. Earlier thresholds were too aggressive — natural rapid
 * blinking would push variance above 0.005 and trip Moderate. The loosened
 * bounds below only flag genuinely-extreme states, with a calibration window
 * (sampleCount) so we don't classify before we have enough data.
 *
 * The returned label is "Low" until at least `MIN_SAMPLES_FOR_RISK` EAR
 * frames have been observed.
 */
const MIN_SAMPLES_FOR_RISK = 60; // ~2s at 30fps

export function assessOcularRisk(
  blinkRate: number,
  earVariance: number,
  avgEar: number,
  sampleCount = MIN_SAMPLES_FOR_RISK,
): OcularRisk {
  if (sampleCount < MIN_SAMPLES_FOR_RISK) return "Low";

  let score = 0;

  // Blink rate — only flag truly extreme values
  if (blinkRate < 5 || blinkRate > 40) score += 3;
  else if (blinkRate < 8 || blinkRate > 30) score += 1;

  // EAR variance — natural blinking puts variance around 0.001–0.005;
  // genuine instability sits above 0.015
  if (earVariance > 0.015) score += 2;
  else if (earVariance > 0.008) score += 1;

  // Very low EAR average suggests ptosis (drooping eyelid)
  if (avgEar > 0 && avgEar < 0.12) score += 1;

  if (score >= 4) return "High";
  if (score >= 3) return "Moderate";
  return "Low";
}

/**
 * Variance helper used inside the vision loop. Returns 0 if fewer than 2 samples.
 */
export function rollingVariance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}
