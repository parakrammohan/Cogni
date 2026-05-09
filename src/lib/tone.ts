import type { GaitLabel } from "../features/motion/lib/gait";
import type { OcularRisk, TrackingMode } from "../features/vision/types";
import type { AlertSeverity, SensorState } from "../types/app";

export function trackerTone(mode: TrackingMode): AlertSeverity {
  if (mode === "live-mesh") return "good";
  if (mode === "camera-search") return "warning";
  if (mode === "offline") return "calm";
  return "info";
}

export function trackerLabel(mode: TrackingMode): string {
  if (mode === "live-mesh") return "Live face mesh";
  if (mode === "camera-search") return "Initializing";
  if (mode === "offline") return "Idle";
  return "Simulation";
}

export function faceLockTone(detected: boolean): AlertSeverity {
  return detected ? "good" : "warning";
}

export function faceLockLabel(detected: boolean): string {
  return detected ? "Face locked" : "Aligning";
}

export function riskTone(risk: OcularRisk): AlertSeverity {
  if (risk === "High") return "danger";
  if (risk === "Moderate") return "warning";
  return "good";
}

export function gaitTone(label: GaitLabel): AlertSeverity {
  if (label === "Fall detected") return "danger";
  if (label === "High fall risk") return "warning";
  if (label === "Irregular") return "info";
  if (label === "Calibrating") return "calm";
  return "good";
}

export function sensorTone(status: SensorState): AlertSeverity {
  if (status === "live") return "good";
  if (status === "loading" || status === "requesting") return "warning";
  return "info";
}

export function sensorLabel(status: SensorState, liveLabel: string): string {
  if (status === "live") return liveLabel;
  if (status === "loading") return "Loading";
  if (status === "requesting") return "Requesting";
  if (status === "offline") return "Standby";
  return "Ready";
}
