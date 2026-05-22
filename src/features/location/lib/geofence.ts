/**
 * Polygon geofencing types + helpers.
 *
 * A zone is an array of (lat, lng) vertices forming a closed polygon
 * (we don't store the first point again at the end — closing is implicit).
 * Each zone has alert modes the caregiver can toggle independently:
 *   - "exit"     fires when the patient leaves the polygon
 *   - "dwelling" fires when the existing dwelling detector triggers
 *                inside (or near) this zone
 *
 * Wandering is a global signal (not per-zone), exposed as its own toggle
 * in the geofencing settings.
 */

import type { LocationPoint } from "../../../types/app";

export type ZoneAlertMode = "exit" | "dwelling";

export interface GeoZone {
  id: string;
  name: string;
  /** Vertices in (lat, lng), at least 3, polygon is implicitly closed. */
  polygon: Array<{ lat: number; lng: number }>;
  alertModes: ZoneAlertMode[];
  createdAt: number;
  /**
   * True when this zone represents the patient's home. Caregiver opts
   * in via a "Mark as home" toggle in the zone list — only one zone
   * can hold it at a time (setting it on a new zone clears it on
   * every other). Behavioural consequence: dwelling-alert checks are
   * skipped inside a home zone (the patient SHOULD be at rest there).
   * "Exit" alerts still fire for home — a patient leaving the home
   * polygon is still leaving a safe zone.
   */
  isHome?: boolean;
}

export interface GeofenceSettings {
  zones: GeoZone[];
  /** Global wandering alert (independent of zones). */
  wanderingEnabled: boolean;
}

export const DEFAULT_GEOFENCE_SETTINGS: GeofenceSettings = {
  zones: [],
  wanderingEnabled: true,
};

/**
 * Point-in-polygon via ray casting. Works on (lat, lng) directly — the
 * algorithm is topological, doesn't care about projection, as long as
 * the polygon is "small enough" that meridian effects don't matter
 * (true for any reasonable geofence at < 50 km scale).
 */
export function pointInPolygon(
  point: { lat: number; lng: number },
  polygon: ReadonlyArray<{ lat: number; lng: number }>,
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.lng > point.lng !== b.lng > point.lng &&
      point.lat < ((b.lat - a.lat) * (point.lng - a.lng)) / (b.lng - a.lng) + a.lat;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface WanderingAnalysis {
  /** True when the heuristics agree the patient is wandering. */
  active: boolean;
  /** Total path length over the window (meters). */
  pathLength: number;
  /** Straight-line displacement first → last (meters). */
  displacement: number;
  /** Ratio path / displacement; > 1 means meandering. */
  tortuosity: number;
  /** 0..1 — entropy of the bearing distribution (high = directionless). */
  bearingEntropy: number;
}

const WANDERING_WINDOW_MS = 3 * 60 * 1000;
const WANDERING_MIN_PATH_M = 30;
const WANDERING_TORTUOSITY = 2.5;
const WANDERING_ENTROPY = 0.75;

/**
 * Wandering detector.
 *
 * Two complementary signals over the last 3 minutes of breadcrumbs:
 *
 *   1. **Tortuosity** — path length / straight-line displacement. Walking
 *      with intent gives ratios close to 1. Wandering (loops, zigzags)
 *      blows the ratio up. We require > 2.5 to fire.
 *
 *   2. **Bearing entropy** — normalized Shannon entropy of the
 *      consecutive-step heading distribution (8 bins). A purposeful
 *      walker has bearings clustered in one direction → low entropy.
 *      A wanderer has bearings spread across many directions → high
 *      entropy (close to 1). We require > 0.75.
 *
 * Both signals must agree to call it wandering — this is the robustness
 * tradeoff: a single noisy fix can spike tortuosity, and a slow figure-
 * eight can have high entropy without much path. Requiring both AND a
 * minimum path length (so a stationary jittery GPS doesn't trip) is
 * what makes the detector survive GPS noise.
 *
 * GPS noise handling:
 *   - We don't trust individual steps shorter than 1 meter (noise
 *     dominates) — those segments are dropped before computing
 *     tortuosity and bearings.
 *   - Trail is implicitly smoothed by the windowing: short jitters
 *     average out over 3 minutes.
 */
export function detectWandering(
  breadcrumbs: ReadonlyArray<LocationPoint>,
  now = Date.now(),
): WanderingAnalysis {
  const window = breadcrumbs.filter((p) => now - p.timestamp <= WANDERING_WINDOW_MS);
  if (window.length < 6) {
    return { active: false, pathLength: 0, displacement: 0, tortuosity: 0, bearingEntropy: 0 };
  }

  let pathLength = 0;
  const bearings: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const a = window[i - 1]!;
    const b = window[i]!;
    const step = haversine(a, b);
    if (step < 1) continue; // discard sub-meter jitter
    pathLength += step;
    bearings.push(bearing(a, b));
  }

  const first = window[0]!;
  const last = window[window.length - 1]!;
  const displacement = haversine(first, last);
  const tortuosity = displacement > 0 ? pathLength / displacement : 0;
  const bearingEntropy = normalizedBearingEntropy(bearings);

  const active =
    pathLength >= WANDERING_MIN_PATH_M &&
    tortuosity >= WANDERING_TORTUOSITY &&
    bearingEntropy >= WANDERING_ENTROPY;

  return { active, pathLength, displacement, tortuosity, bearingEntropy };
}

function normalizedBearingEntropy(bearings: number[]): number {
  if (bearings.length === 0) return 0;
  const bins = new Array(8).fill(0) as number[];
  for (const b of bearings) {
    const idx = Math.floor((((b % 360) + 360) % 360) / 45) % 8;
    bins[idx]! += 1;
  }
  let entropy = 0;
  for (const count of bins) {
    if (count === 0) continue;
    const p = count / bearings.length;
    entropy -= p * Math.log(p);
  }
  // Shannon entropy of 8-bin uniform is ln(8). Normalize to 0..1.
  return entropy / Math.log(8);
}

const EARTH_R = 6371000;

export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Generate a random short id for new zones. */
export function newZoneId(): string {
  return `zone_${Math.random().toString(36).slice(2, 9)}`;
}
