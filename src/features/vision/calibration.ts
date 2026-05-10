/**
 * Gaze calibration via linear regression.
 *
 * Following the standard web-eye-tracking pipeline: collect (iris, screen)
 * pairs while the user fixates known points, then fit a 2D affine map that
 * translates raw iris coordinates to predicted screen coordinates.
 *
 * Model:
 *   screen_x = a * iris_x + b * iris_y + c
 *   screen_y = d * iris_x + e * iris_y + f
 *
 * Solved via the normal equations: β = (X'X)⁻¹ X'y where X has rows
 * [iris_x, iris_y, 1]. We do the 3x3 invert by hand to avoid pulling in a
 * matrix library.
 *
 * Caveats:
 *   - Affine 2D mapping. No 3D head-pose compensation; the patient is asked
 *     to keep their head still during calibration and the test.
 *   - Captures `kappa angle` (the offset between visual and optical axis)
 *     and screen-camera relative geometry implicitly via the regression.
 *   - One linear model per session; recalibrate if the head pose drifts.
 */

import { clamp } from "../../lib/utils";

export interface IrisPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number; // 0..100 % of stage width
  y: number; // 0..100 % of stage height
}

export interface CalibrationSample {
  iris: IrisPoint;
  screen: ScreenPoint;
}

export interface CalibrationModel {
  /** [a, b, c] for screen_x = a*iris_x + b*iris_y + c */
  xCoefs: [number, number, number];
  /** [d, e, f] for screen_y = d*iris_x + e*iris_y + f */
  yCoefs: [number, number, number];
  /** Mean absolute residual error in % units across both axes; lower is better */
  meanResidual: number;
  /** RMS residual; matches what the test stage shows as a quality score */
  rmsResidual: number;
  /** Number of samples used in the fit */
  sampleCount: number;
  /** Wall-clock time of capture; used to invalidate stale calibrations */
  capturedAt: number;
}

/** Returns null if too few samples or the system is degenerate. */
export function computeCalibration(samples: CalibrationSample[]): CalibrationModel | null {
  if (samples.length < 4) return null;

  // Build the design matrix X (n x 3) and target vectors yX, yY.
  // We solve for β = (X'X)⁻¹ X'y in closed form.
  const xCoefs = solveAxis(samples, "x");
  const yCoefs = solveAxis(samples, "y");
  if (!xCoefs || !yCoefs) return null;

  // Compute residuals on the training set as a quality metric.
  let absSum = 0;
  let sqSum = 0;
  for (const sample of samples) {
    const px =
      xCoefs[0] * sample.iris.x + xCoefs[1] * sample.iris.y + xCoefs[2];
    const py =
      yCoefs[0] * sample.iris.x + yCoefs[1] * sample.iris.y + yCoefs[2];
    const dx = px - sample.screen.x;
    const dy = py - sample.screen.y;
    const dist = Math.hypot(dx, dy);
    absSum += dist;
    sqSum += dist * dist;
  }
  const meanResidual = absSum / samples.length;
  const rmsResidual = Math.sqrt(sqSum / samples.length);

  return {
    xCoefs,
    yCoefs,
    meanResidual,
    rmsResidual,
    sampleCount: samples.length,
    capturedAt: Date.now(),
  };
}

function solveAxis(
  samples: CalibrationSample[],
  axis: "x" | "y",
): [number, number, number] | null {
  // X'X is symmetric 3x3. Build it in place.
  let s11 = 0;
  let s12 = 0;
  let s13 = 0;
  let s22 = 0;
  let s23 = 0;
  let s33 = samples.length;
  // X'y
  let t1 = 0;
  let t2 = 0;
  let t3 = 0;
  for (const sample of samples) {
    const ix = sample.iris.x;
    const iy = sample.iris.y;
    const target = sample.screen[axis];
    s11 += ix * ix;
    s12 += ix * iy;
    s13 += ix;
    s22 += iy * iy;
    s23 += iy;
    t1 += ix * target;
    t2 += iy * target;
    t3 += target;
  }
  // Symmetric: s21 = s12, s31 = s13, s32 = s23
  // Solve XtX * β = Xty via 3x3 inverse.
  return invert3x3MultiplyVec(
    [
      [s11, s12, s13],
      [s12, s22, s23],
      [s13, s23, s33],
    ],
    [t1, t2, t3],
  );
}

function invert3x3MultiplyVec(
  m: [[number, number, number], [number, number, number], [number, number, number]],
  v: [number, number, number],
): [number, number, number] | null {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];

  const det =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);

  // Reject if the system is near-singular (e.g. all calibration dots at the
  // same position, no eye movement captured).
  if (Math.abs(det) < 1e-9) return null;

  // Cofactor / adjugate
  const A = (e * i - f * h) / det;
  const B = -(b * i - c * h) / det;
  const C = (b * f - c * e) / det;
  const D = -(d * i - f * g) / det;
  const E = (a * i - c * g) / det;
  const F = -(a * f - c * d) / det;
  const G = (d * h - e * g) / det;
  const H = -(a * h - b * g) / det;
  const I = (a * e - b * d) / det;

  return [
    A * v[0] + B * v[1] + C * v[2],
    D * v[0] + E * v[1] + F * v[2],
    G * v[0] + H * v[1] + I * v[2],
  ];
}

/** Apply the calibration to a raw iris position; result clamped to 0..100. */
export function applyCalibration(
  iris: IrisPoint,
  model: CalibrationModel,
): ScreenPoint {
  const x = model.xCoefs[0] * iris.x + model.xCoefs[1] * iris.y + model.xCoefs[2];
  const y = model.yCoefs[0] * iris.x + model.yCoefs[1] * iris.y + model.yCoefs[2];
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
}

/**
 * Exponential moving average smoother. Replaces the natural high-frequency
 * jitter in webcam-derived iris coordinates without the latency of a Kalman
 * filter. Pass `null` (e.g. during a blink) to hold the last value instead
 * of letting the gaze "jump" while the eyes are closed.
 */
export class GazeSmoother {
  private value: ScreenPoint | null = null;
  constructor(private readonly alpha: number = 0.35) {}

  push(next: ScreenPoint | null): ScreenPoint | null {
    if (next === null) return this.value;
    if (this.value === null) {
      this.value = { x: next.x, y: next.y };
    } else {
      this.value = {
        x: this.alpha * next.x + (1 - this.alpha) * this.value.x,
        y: this.alpha * next.y + (1 - this.alpha) * this.value.y,
      };
    }
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/** Calibration validity window — beyond this, ask the user to recalibrate. */
export const CALIBRATION_TTL_MS = 24 * 60 * 60 * 1000;

export function isCalibrationFresh(model: CalibrationModel | null): boolean {
  if (!model) return false;
  return Date.now() - model.capturedAt < CALIBRATION_TTL_MS;
}
