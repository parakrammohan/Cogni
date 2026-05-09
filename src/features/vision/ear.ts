import type { OcularRisk } from "./types";

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

/** Below this EAR, the eye is considered closed for blink detection. */
export const EAR_BLINK_THRESHOLD = 0.2;
/** Frames the eye must stay closed before counting a blink. */
export const BLINK_CONSEC_FRAMES = 2;

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

  /** Push a new EAR sample. Returns true if a blink was just registered. */
  tick(ear: number): boolean {
    const now = performance.now();
    // Trim timestamps older than the rolling window.
    while (this.blinkTimestamps.length > 0) {
      const oldest = this.blinkTimestamps[0];
      if (oldest === undefined || now - oldest <= RATE_WINDOW_MS) break;
      this.blinkTimestamps.shift();
    }

    if (ear < EAR_BLINK_THRESHOLD) {
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
 * Clinical reference: normal adult blink rate is 10-20 blinks/min;
 * Parkinson's / dementia populations show <10 or >30, plus erratic patterns.
 */
export function assessOcularRisk(
  blinkRate: number,
  earVariance: number,
  avgEar: number,
): OcularRisk {
  let score = 0;

  if (blinkRate < 8 || blinkRate > 32) score += 3;
  else if (blinkRate < 10 || blinkRate > 25) score += 1;

  if (earVariance > 0.005) score += 2;
  else if (earVariance > 0.002) score += 1;

  if (avgEar > 0 && avgEar < 0.15) score += 1;

  if (score >= 4) return "High";
  if (score >= 2) return "Moderate";
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
