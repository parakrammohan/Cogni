import type { SafeZone } from "../../../types/app";
import { offsetCoord } from "./geo";

export type LocationScenario = "home" | "pacing" | "dwelling";

const HOME_OFFSETS: Array<readonly [number, number]> = [
  [0, 0],
  [10, 8],
  [24, 14],
  [18, 26],
  [6, 24],
  [-8, 18],
  [-16, 10],
  [-6, -4],
  [8, -12],
  [20, -6],
];

const PACING_OFFSETS: Array<readonly [number, number]> = [
  [170, 20],
  [214, 20],
  [171, 22],
  [213, 18],
  [170, 20],
  [214, 20],
  [171, 22],
  [213, 18],
];

const DWELLING_OFFSETS: Array<readonly [number, number]> = [
  [-172, 140],
  [-166, 145],
  [-164, 141],
  [-170, 146],
  [-168, 139],
  [-165, 144],
  [-171, 143],
  [-167, 147],
];

export function buildLocationScenarios(
  base: SafeZone,
): Record<LocationScenario, Array<{ lat: number; lng: number }>> {
  return {
    home: HOME_OFFSETS.map(([east, north]) => offsetCoord(base, east, north)),
    pacing: PACING_OFFSETS.map(([east, north]) => offsetCoord(base, east, north)),
    dwelling: DWELLING_OFFSETS.map(([east, north]) => offsetCoord(base, east, north)),
  };
}
