/**
 * Cross-feature primitive types. Feature-specific types live alongside their feature
 * (e.g. VisionMetrics in features/vision/types.ts, GaitAnalysis in features/motion/lib/gait.ts).
 */

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

export interface MotionSample {
  x: number;
  y: number;
  z: number;
  timestamp: number;
  magnitude: number;
}

export interface GameSession {
  id: string;
  createdAt: number;
  memorySpan: number;
  avgReaction: number;
  mistakes: number;
  status?: "checkpoint" | "final";
}

export interface SensorStatus {
  geo: SensorState;
  motion: SensorState;
  camera: SensorState;
  vision: SensorState;
}

// Re-exports keep existing consumers working without circular import paths.
export type {
  LocalPoint,
  PacingAnalysis,
  DwellingAnalysis,
  LocationAnalysis,
} from "../features/location/lib/location";
export type { GaitAnalysis, GaitLabel } from "../features/motion/lib/gait";
export type { VisionMetrics, VisionDebug, OcularRisk, TrackingMode } from "../features/vision/types";
