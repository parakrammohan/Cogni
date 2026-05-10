/**
 * Gaze calibration via linear regression on head-pose-invariant features.
 *
 * Input features per sample:
 *   - eyeRelative.x  iris position normalized to its eye-corner box
 *   - eyeRelative.y  same for the vertical axis
 *   - irisDiameter   average iris radius in pixels (depth proxy)
 *   - 1              intercept
 *
 * Targets: screen.x, screen.y in 0..100 % of the test stage.
 *
 * Solved via the normal equations β = (XᵀX)⁻¹ Xᵀy. We do the matrix solve
 * with in-place Gauss–Jordan to keep the code generic over the feature
 * count without pulling in a linear-algebra library.
 *
 * Why head-pose features instead of raw iris coords:
 *   - Raw iris position varies with head translation (head moves left → iris
 *     moves left in image even though gaze hasn't changed).
 *   - Eye-relative iris position factors out head translation entirely
 *     (the eye corners ride with the head, so the ratio stays put).
 *   - Iris diameter scales with face-camera distance — the regression
 *     learns to compensate when the user leans in or out.
 *   - Calibration stays usable through small head moves without a full PnP.
 */

import { clamp } from "../../lib/utils";

export interface GazeFeatures {
  eyeRelative: { x: number; y: number };
  irisDiameter: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface CalibrationSample {
  features: GazeFeatures;
  screen: ScreenPoint;
}

/** 4 coefficients per axis: [eyeRelX, eyeRelY, irisDiameter, intercept]. */
export type AxisCoefs = [number, number, number, number];

export interface CalibrationModel {
  xCoefs: AxisCoefs;
  yCoefs: AxisCoefs;
  meanResidual: number;
  rmsResidual: number;
  sampleCount: number;
  capturedAt: number;
}

const FEATURE_COUNT = 4;

function featuresVector(features: GazeFeatures): [number, number, number, number] {
  return [features.eyeRelative.x, features.eyeRelative.y, features.irisDiameter, 1];
}

export function computeCalibration(samples: CalibrationSample[]): CalibrationModel | null {
  if (samples.length < FEATURE_COUNT) return null;

  const xCoefs = solveAxis(samples, "x");
  const yCoefs = solveAxis(samples, "y");
  if (!xCoefs || !yCoefs) return null;

  let absSum = 0;
  let sqSum = 0;
  for (const sample of samples) {
    const px = predict(xCoefs, sample.features);
    const py = predict(yCoefs, sample.features);
    const dist = Math.hypot(px - sample.screen.x, py - sample.screen.y);
    absSum += dist;
    sqSum += dist * dist;
  }

  return {
    xCoefs,
    yCoefs,
    meanResidual: absSum / samples.length,
    rmsResidual: Math.sqrt(sqSum / samples.length),
    sampleCount: samples.length,
    capturedAt: Date.now(),
  };
}

function solveAxis(samples: CalibrationSample[], axis: "x" | "y"): AxisCoefs | null {
  const A: number[][] = Array.from({ length: FEATURE_COUNT }, () =>
    Array(FEATURE_COUNT).fill(0),
  );
  const b: number[] = Array(FEATURE_COUNT).fill(0);
  for (const sample of samples) {
    const x = featuresVector(sample.features);
    const target = sample.screen[axis];
    for (let i = 0; i < FEATURE_COUNT; i++) {
      const xi = x[i]!;
      for (let j = 0; j < FEATURE_COUNT; j++) {
        A[i]![j]! += xi * x[j]!;
      }
      b[i]! += xi * target;
    }
  }
  const solved = gaussJordanSolve(A, b);
  if (!solved) return null;
  return [solved[0]!, solved[1]!, solved[2]!, solved[3]!];
}

/** Solve Ax = b in place via partial-pivot Gauss–Jordan. Null if singular. */
function gaussJordanSolve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < n; i++) {
    let pivotRow = i;
    let pivotMag = Math.abs(M[i]![i]!);
    for (let k = i + 1; k < n; k++) {
      const mag = Math.abs(M[k]![i]!);
      if (mag > pivotMag) {
        pivotMag = mag;
        pivotRow = k;
      }
    }
    if (pivotMag < 1e-9) return null;
    if (pivotRow !== i) {
      const tmp = M[i]!;
      M[i] = M[pivotRow]!;
      M[pivotRow] = tmp;
    }
    const pivot = M[i]![i]!;
    for (let j = i; j <= n; j++) M[i]![j]! /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = M[r]![i]!;
      if (factor === 0) continue;
      for (let j = i; j <= n; j++) M[r]![j]! -= factor * M[i]![j]!;
    }
  }
  return M.map((row) => row[n]!);
}

function predict(coefs: AxisCoefs, features: GazeFeatures): number {
  const [a, b, c, d] = coefs;
  return (
    a * features.eyeRelative.x +
    b * features.eyeRelative.y +
    c * features.irisDiameter +
    d
  );
}

/** Apply the calibration to a fresh feature vector. Result clamped 0..100. */
export function applyCalibration(
  features: GazeFeatures,
  model: CalibrationModel,
): ScreenPoint {
  return {
    x: clamp(predict(model.xCoefs, features), 0, 100),
    y: clamp(predict(model.yCoefs, features), 0, 100),
  };
}

/**
 * 2D constant-velocity Kalman filter for gaze smoothing.
 *
 * State:        [x, y, vx, vy]ᵀ
 * Transition F: identity-with-velocity, dt = 1 (one filter "tick" per sample)
 * Measurement: H = [[1,0,0,0],[0,1,0,0]] — we only see position
 * Noise:        Q = process noise, R = measurement noise
 *
 * Replaces a plain EMA because Kalman tracks a velocity prior — when a
 * sample is dropped (blink), the predict step extrapolates instead of
 * holding still, giving a more honest gaze estimate during short gaps.
 */
export class GazeSmoother {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private hasState = false;

  // P stored as a flat 4x4 covariance matrix.
  private P = new Array<number>(16);

  constructor(
    private readonly q: number = 0.6,
    private readonly r: number = 4,
  ) {
    this.reset();
  }

  reset(): void {
    this.hasState = false;
    this.x = this.y = this.vx = this.vy = 0;
    // Wide prior
    for (let i = 0; i < 16; i++) this.P[i] = 0;
    this.P[0] = this.P[5] = this.P[10] = this.P[15] = 1000;
  }

  /** Measurement of position; pass null during blinks for predict-only. */
  push(measurement: ScreenPoint | null): ScreenPoint | null {
    if (!this.hasState) {
      if (!measurement) return null;
      this.x = measurement.x;
      this.y = measurement.y;
      this.hasState = true;
      return { x: this.x, y: this.y };
    }

    // Predict — constant-velocity model. The x and y axes are independent
    // so we propagate two 2x2 (position, velocity) blocks, which is the
    // full F P Fᵀ + Q for this state layout. Without propagating the
    // position↔velocity cross-covariance, the velocity Kalman gain stays
    // at 0 forever and the smoother degrades to a position EMA.
    this.x += this.vx;
    this.y += this.vy;

    // X block: P[0]=var(x), P[2]=cov(x,vx), P[8]=cov(vx,x) (symmetric to P[2]), P[10]=var(vx)
    const px00 = this.P[0]!;
    const px01 = this.P[2]!;
    const px11 = this.P[10]!;
    this.P[0] = px00 + 2 * px01 + px11 + this.q;
    this.P[2] = px01 + px11;
    this.P[8] = this.P[2]!;
    this.P[10] = px11 + this.q;

    // Y block: P[5]=var(y), P[7]=cov(y,vy), P[13]=cov(vy,y), P[15]=var(vy)
    const py00 = this.P[5]!;
    const py01 = this.P[7]!;
    const py11 = this.P[15]!;
    this.P[5] = py00 + 2 * py01 + py11 + this.q;
    this.P[7] = py01 + py11;
    this.P[13] = this.P[7]!;
    this.P[15] = py11 + this.q;

    if (!measurement) return { x: this.x, y: this.y };

    // Update — measurement is position only (H = [1 0]). Use the predicted
    // P (saved into locals) so K and the new P are computed consistently.
    const sX = this.P[0]! + this.r;
    const sY = this.P[5]! + this.r;
    const P0 = this.P[0]!, P2 = this.P[2]!, P10 = this.P[10]!;
    const P5 = this.P[5]!, P7 = this.P[7]!, P15 = this.P[15]!;
    const kPx = P0 / sX;
    const kPy = P5 / sY;
    const kVx = P2 / sX;
    const kVy = P7 / sY;
    const innovX = measurement.x - this.x;
    const innovY = measurement.y - this.y;
    this.x += kPx * innovX;
    this.y += kPy * innovY;
    this.vx += kVx * innovX;
    this.vy += kVy * innovY;
    // (I - K H) P, where H selects the position element of each block
    this.P[0] = (1 - kPx) * P0;
    this.P[2] = (1 - kPx) * P2;
    this.P[8] = this.P[2]!;
    this.P[10] = P10 - kVx * P2;
    this.P[5] = (1 - kPy) * P5;
    this.P[7] = (1 - kPy) * P7;
    this.P[13] = this.P[7]!;
    this.P[15] = P15 - kVy * P7;

    return { x: this.x, y: this.y };
  }
}

export const CALIBRATION_TTL_MS = 24 * 60 * 60 * 1000;

export function isCalibrationFresh(model: CalibrationModel | null): boolean {
  if (!model) return false;
  return Date.now() - model.capturedAt < CALIBRATION_TTL_MS;
}
