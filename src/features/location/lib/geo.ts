import type { LocationPoint, SafeZone } from "../../../types/app";

const EARTH_RADIUS_M = 6_371_000;

type Coord = Pick<LocationPoint, "lat" | "lng"> | SafeZone;

/** Great-circle distance in meters between two lat/lng points. */
export function haversineMeters(a: Coord | null, b: Coord | null): number {
  if (!a || !b) return 0;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const blend = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(blend));
}

/**
 * Returns a new lat/lng offset by `eastM` meters east and `northM` meters north of `base`.
 * Uses a flat-earth approximation (accurate to within ~0.5% for offsets under a few km).
 */
export function offsetCoord(
  base: Coord,
  eastM: number,
  northM: number,
): { lat: number; lng: number } {
  const lat = base.lat + northM / 111_320;
  const lng = base.lng + eastM / (111_320 * Math.cos((base.lat * Math.PI) / 180));
  return { lat, lng };
}

/**
 * Converts a lat/lng point to local meters relative to `origin`.
 * Returns east (x) and north (y) in meters.
 */
export function toLocalMeters(
  point: Pick<LocationPoint, "lat" | "lng">,
  origin: Coord,
): { x: number; y: number } {
  const east =
    (point.lng - origin.lng) * 111_320 * Math.cos((((point.lat + origin.lat) / 2) * Math.PI) / 180);
  const north = (point.lat - origin.lat) * 111_320;
  return { x: east, y: north };
}
