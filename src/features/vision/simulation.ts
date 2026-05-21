/**
 * Pure helpers for the simulated gaze overlay used when the camera is off.
 * Drives a moving target across four "lanes" (top-left → bottom-right → repeat)
 * and a noisy gaze that loosely tracks it.
 */

const PHASE_MS = 4000;

export interface SimulatedTarget {
  x: number;
  y: number;
  /** Lane index (0-3); changes trigger latency measurement. */
  lane: number;
}

export function simulatedTarget(elapsedMs: number, width: number, height: number): SimulatedTarget {
  const lane = Math.floor(elapsedMs / PHASE_MS) % 4;
  const progress = (elapsedMs % PHASE_MS) / PHASE_MS;
  const paddingX = width * 0.16;
  const paddingY = height * 0.18;

  switch (lane) {
    case 0:
      return { x: paddingX + (width - paddingX * 2) * progress, y: height * 0.3, lane };
    case 1:
      return { x: width - paddingX, y: paddingY + (height - paddingY * 2) * progress, lane };
    case 2:
      return {
        x: width - paddingX - (width - paddingX * 2) * progress,
        y: height * 0.72,
        lane,
      };
    default:
      return { x: paddingX, y: height - paddingY - (height - paddingY * 2) * progress, lane };
  }
}

/**
 * Returns a noisy gaze position that follows the target with offset and jitter.
 * `nowMs` should be `performance.now()` so the noise pattern stays stable.
 */
export function simulatedGaze(target: SimulatedTarget, nowMs: number): { x: number; y: number } {
  return {
    x: target.x + Math.sin(nowMs / 340) * 18 + 22,
    y: target.y + Math.cos(nowMs / 390) * 10,
  };
}
