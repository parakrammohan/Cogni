export type UserView = "patient" | "caregiver";
export type SensorState = "simulation" | "live" | "requesting" | "loading" | "offline";
export type AlertSeverity = "info" | "warning" | "danger" | "good" | "calm";

export interface AppAlert {
  id: string;
  createdAt: number;
  module: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  dedupeKey?: string;
}

export interface AlertInput {
  module: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  dedupeKey?: string;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
  simulated?: boolean;
}

export interface SafeZone {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface LocalPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface MotionSample {
  x: number;
  y: number;
  z: number;
  timestamp: number;
  magnitude: number;
}

export interface VisionMetrics {
  fixation: number;
  latency: number;
  ear: number;
  mode: SensorState;
  risk: "Low" | "Moderate" | "High";
  source: string;
  trackingMode: "simulation" | "camera-search" | "live-mesh";
  faceDetected: boolean;
  landmarkCount: number;
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

export interface GameSession {
  id: string;
  createdAt: number;
  memorySpan: number;
  avgReaction: number;
  mistakes: number;
  status?: "checkpoint" | "final";
}

export interface PacingAnalysis {
  active: boolean;
  crossings: number;
  span: number;
  width: number;
}

export interface DwellingAnalysis {
  active: boolean;
  diagonal: number;
  duration: number;
  width: number;
  height: number;
}

export interface LocationAnalysis {
  latest: LocationPoint | null;
  currentDistance: number;
  outOfBounds: boolean;
  pacing: PacingAnalysis;
  dwelling: DwellingAnalysis;
  localTrail: LocalPoint[];
  breadcrumbTrail: LocationPoint[];
}

export interface GaitAnalysis {
  label: string;
  color: string;
  zStd: number;
  yStd: number;
  xStd: number;
  fallDetected: boolean;
  riskScore: number;
  magnitudeAvg?: number;
  magnitudeStd?: number;
  peakMagnitude?: number;
  signals: {
    verticalLift: number;
    forwardConsistency: number;
    lateralDrift: number;
    impactSpike: number;
    postImpactStillness: number;
  };
}

export interface SensorStatus {
  geo: SensorState;
  motion: SensorState;
  camera: SensorState;
  vision: SensorState;
}
