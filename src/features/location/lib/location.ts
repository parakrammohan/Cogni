import type { LocationPoint, SafeZone } from "../../../types/app";
import { haversineMeters, toLocalMeters } from "./geo";

export interface LocalPoint {
  x: number;
  y: number;
  timestamp: number;
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

const PACING_WINDOW_MS = 5 * 60 * 1000;
const DWELLING_WINDOW_MS = 15 * 60 * 1000;

export function normalizeBreadcrumbs<T>(points: T[], limit: number): T[] {
  return points.slice(-limit);
}

function lineDistance(a: LocalPoint, b: LocalPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Detects "pacing" gait — back-and-forth motion along a corridor of length 24-90 m.
 * Projects all points onto the longest-axis line through them, then counts midpoint
 * crossings. O(n²) anchor search; bounded by the breadcrumb window cap (~80 points).
 */
export function detectPacing(points: LocalPoint[]): PacingAnalysis {
  if (points.length < 6) {
    return { active: false, crossings: 0, span: 0, width: 0 };
  }

  let maxDistance = 0;
  let anchorA = points[0]!;
  let anchorB = points[points.length - 1]!;

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!;
      const b = points[j]!;
      const d = lineDistance(a, b);
      if (d > maxDistance) {
        maxDistance = d;
        anchorA = a;
        anchorB = b;
      }
    }
  }

  if (maxDistance < 24 || maxDistance > 90) {
    return { active: false, crossings: 0, span: maxDistance, width: 0 };
  }

  const axis = {
    x: (anchorB.x - anchorA.x) / maxDistance,
    y: (anchorB.y - anchorA.y) / maxDistance,
  };
  const orth = { x: -axis.y, y: axis.x };
  const projections = points.map((p) => ({
    along: p.x * axis.x + p.y * axis.y,
    across: p.x * orth.x + p.y * orth.y,
  }));

  const alongValues = projections.map((p) => p.along);
  const acrossValues = projections.map((p) => p.across);
  const minAlong = Math.min(...alongValues);
  const maxAlong = Math.max(...alongValues);
  const midpoint = (minAlong + maxAlong) / 2;
  const span = maxAlong - minAlong;
  const width = Math.max(...acrossValues) - Math.min(...acrossValues);
  const threshold = Math.max(6, span * 0.16);

  let crossings = 0;
  let previousSide = 0;
  for (const proj of projections) {
    const delta = proj.along - midpoint;
    const side = Math.abs(delta) < threshold ? 0 : Math.sign(delta);
    if (side !== 0 && previousSide !== 0 && side !== previousSide) crossings += 1;
    if (side !== 0) previousSide = side;
  }

  return { active: span >= 28 && width <= 18 && crossings >= 4, crossings, span, width };
}

/** Detects extended low-motion dwelling outside the safe zone. */
export function detectDwelling(
  points: LocalPoint[],
  currentDistance: number,
  safeZoneRadius: number,
): DwellingAnalysis {
  if (points.length < 2) {
    return { active: false, diagonal: 0, duration: 0, width: 0, height: 0 };
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const diagonal = Math.hypot(width, height);
  const last = points[points.length - 1];
  const first = points[0];
  if (!last || !first) {
    return { active: false, diagonal: 0, duration: 0, width, height };
  }
  const duration = last.timestamp - first.timestamp;
  const active =
    currentDistance > safeZoneRadius && duration >= DWELLING_WINDOW_MS && diagonal < 10;
  return { active, diagonal, duration, width, height };
}

export function analyzeLocation(
  breadcrumbs: LocationPoint[],
  safeZone: SafeZone,
): LocationAnalysis {
  const latest = breadcrumbs.at(-1) ?? null;
  const currentDistance = latest ? haversineMeters(latest, safeZone) : 0;
  const outOfBounds = currentDistance > safeZone.radiusM;

  const pacingWindow: LocalPoint[] = breadcrumbs
    .filter((p) => latest && latest.timestamp - p.timestamp <= PACING_WINDOW_MS)
    .map((p) => ({ ...toLocalMeters(p, safeZone), timestamp: p.timestamp }));

  const dwellingWindow: LocalPoint[] = breadcrumbs
    .filter((p) => latest && latest.timestamp - p.timestamp <= DWELLING_WINDOW_MS)
    .map((p) => ({ ...toLocalMeters(p, safeZone), timestamp: p.timestamp }));

  return {
    latest,
    currentDistance,
    outOfBounds,
    pacing: detectPacing(pacingWindow),
    dwelling: detectDwelling(dwellingWindow, currentDistance, safeZone.radiusM),
    breadcrumbTrail: breadcrumbs,
    localTrail: breadcrumbs.map((p) => ({
      ...toLocalMeters(p, safeZone),
      timestamp: p.timestamp,
    })),
  };
}
