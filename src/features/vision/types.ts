import type { SensorState } from "../../types/app";

export type TrackingMode = "offline" | "simulation" | "camera-search" | "live-mesh";
export type OcularRisk = "Low" | "Moderate" | "High";

export interface VisionMetrics {
  /** Eye Aspect Ratio averaged across both eyes */
  ear: number;
  /** EAR for the left eye specifically (subject's left) */
  leftEar: number;
  /** EAR for the right eye */
  rightEar: number;
  /** Blink rate in blinks per minute */
  blinkRate: number;
  /** Stability of fixation 0-100% */
  fixation: number;
  /** Latency in ms between target movement and gaze response */
  latency: number;
  /** Demand-mode used to compute the metrics */
  mode: SensorState;
  /** Tracking pipeline mode */
  trackingMode: TrackingMode;
  /** Whether a face is currently locked */
  faceDetected: boolean;
  /** Number of landmarks currently feeding the overlay */
  landmarkCount: number;
  /** Iris position normalized to canvas percent (0-100, 0-100). Null when not live. */
  irisPosition: { x: number; y: number } | null;
  /** Risk classification derived from EAR + blink rate */
  risk: OcularRisk;
  /** Source string shown in the UI */
  source: string;
  /** True while the patient is mid-blink — consumers can suppress gaze samples */
  isBlinking: boolean;
}

export interface VisionDebug {
  backend: string;
  detectorLoaded: boolean;
  streamActive: boolean;
  videoReadyState: number;
  videoWidth: number;
  videoHeight: number;
  lastFaceCount: number;
  lastInferenceMs: number;
  lastInferenceAt: number | null;
  lastError: string | null;
  lockReason: string;
}

export const DEFAULT_VISION_METRICS: VisionMetrics = {
  ear: 0,
  leftEar: 0,
  rightEar: 0,
  blinkRate: 0,
  fixation: 0,
  latency: 0,
  mode: "offline",
  trackingMode: "offline",
  faceDetected: false,
  landmarkCount: 0,
  irisPosition: null,
  risk: "Low",
  source: "Idle",
  isBlinking: false,
};
