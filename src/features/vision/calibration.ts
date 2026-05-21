/**
 * Gaze calibration via linear regression on head-pose-cancelled features.
 *
 * We use a much richer feature vector than a naive iris-position regressor:
 *
 *   Per-eye geometry (4):
 *     - leftIrisX, rightIrisX       Iris position within each eye, normalized
 *                                   to the eye-corner horizontal span. Drops
 *                                   head translation entirely (the eye corners
 *                                   ride with the head).
 *     - leftIrisY, rightIrisY       Iris position within the eyelid aperture,
 *                                   normalized to the top↔bottom lid distance.
 *                                   This is the strong vertical-gaze cue.
 *
 *   Eye aperture (2):
 *     - leftEyeOpenness,            Vertical eyelid distance / horizontal eye
 *       rightEyeOpenness            width. Drops when looking down (upper lid
 *                                   covers more of the eye), grows when looking
 *                                   up (eyelid retracts).
 *
 *   Head pose (3):
 *     - headYaw, headPitch, headRoll   Euler angles extracted from MediaPipe's
 *                                      facialTransformationMatrix. The
 *                                      regression learns to cancel head
 *                                      rotation effects on the iris-within-eye
 *                                      measurements.
 *
 *   Depth proxy (1):
 *     - irisDiameter                Pixel radius — implicit face-camera
 *                                   distance signal so the model compensates
 *                                   when the user leans in or out.
 *
 * Total: 10 features + intercept = 11 unknowns per axis. Solved with the
 * normal equations β = (XᵀX)⁻¹ Xᵀy and in-place Gauss–Jordan elimination so
 * we stay generic over feature count without a linear-algebra library.
 *
 * Calibration samples the user fixating on each of 9 grid points; with a
 * 2.5s dwell and 600ms settle we get ~13 samples per point × 9 = ~120
 * samples, giving ~10 samples per unknown. Tight but workable for a low-
 * noise scenario.
 */

import { clamp } from "../../lib/utils";

export interface GazeFeatures {
  leftIrisX: number;
  rightIrisX: number;
  leftIrisY: number;
  rightIrisY: number;
  leftEyeOpenness: number;
  rightEyeOpenness: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
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

/** Coefficients for one screen axis: one per feature plus an intercept. */
export type AxisCoefs = number[];

export interface CalibrationModel {
  xCoefs: AxisCoefs;
  yCoefs: AxisCoefs;
  meanResidual: number;
  rmsResidual: number;
  sampleCount: number;
  capturedAt: number;
}

const FEATURE_NAMES: Array<keyof GazeFeatures> = [
  "leftIrisX",
  "rightIrisX",
  "leftIrisY",
  "rightIrisY",
  "leftEyeOpenness",
  "rightEyeOpenness",
  "headYaw",
  "headPitch",
  "headRoll",
  "irisDiameter",
];

/** N feature dimensions + 1 intercept. */
const FEATURE_COUNT = FEATURE_NAMES.length + 1;

function featuresVector(features: GazeFeatures): number[] {
  const out: number[] = new Array(FEATURE_COUNT);
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    out[i] = features[FEATURE_NAMES[i]!];
  }
  out[FEATURE_NAMES.length] = 1; // intercept
  return out;
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
    new Array(FEATURE_COUNT).fill(0),
  );
  const b: number[] = new Array(FEATURE_COUNT).fill(0);
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
  // Tiny diagonal regularization (Tikhonov) so we don't blow up when two
  // features are nearly collinear in the captured samples (very common when
  // the user holds their head perfectly still — head pose features become
  // constants and Xᵀ X is singular).
  for (let i = 0; i < FEATURE_COUNT; i++) A[i]![i]! += 1e-4;

  return gaussJordanSolve(A, b);
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
  const x = featuresVector(features);
  let sum = 0;
  for (let i = 0; i < FEATURE_COUNT; i++) sum += coefs[i]! * x[i]!;
  return sum;
}

/** Apply the calibration to a fresh feature vector. Result clamped 0..100. */
export function applyCalibration(features: GazeFeatures, model: CalibrationModel): ScreenPoint {
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
 * blink temporarily drops measurements, predict() keeps moving the
 * smoothed point along its trajectory instead of freezing.
 */
export class GazeSmoother {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  // 4x4 covariance, flattened row-major. Index = row * 4 + col.
  private P: number[] = new Array(16).fill(0);
  private hasState = false;
  private readonly q: number;
  private readonly r: number;

  constructor(processNoise = 0.5, measurementNoise = 2.0) {
    this.q = processNoise;
    this.r = measurementNoise;
    // Strong initial uncertainty so the first measurement gets weight 1.
    this.P[0] = 1000;
    this.P[5] = 1000;
    this.P[10] = 1000;
    this.P[15] = 1000;
  }

  reset() {
    this.hasState = false;
    this.vx = 0;
    this.vy = 0;
    this.P.fill(0);
    this.P[0] = 1000;
    this.P[5] = 1000;
    this.P[10] = 1000;
    this.P[15] = 1000;
  }

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
    const P0 = this.P[0]!,
      P2 = this.P[2]!,
      P10 = this.P[10]!;
    const P5 = this.P[5]!,
      P7 = this.P[7]!,
      P15 = this.P[15]!;
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
