import { average, clamp, stdDev } from "./utils";
import type { LocationPoint, SafeZone } from "../types/app";

export function haversineMeters(a: Pick<LocationPoint, "lat" | "lng"> | SafeZone | null, b: Pick<LocationPoint, "lat" | "lng"> | SafeZone | null) {
  if (!a || !b) return 0;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const blend = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earth * Math.asin(Math.sqrt(blend));
}

export function offsetCoord(base: Pick<LocationPoint, "lat" | "lng"> | SafeZone, eastM: number, northM: number) {
  const lat = base.lat + northM / 111320;
  const lng = base.lng + eastM / (111320 * Math.cos((base.lat * Math.PI) / 180));
  return { lat, lng };
}

export function toLocalMeters(point: Pick<LocationPoint, "lat" | "lng">, origin: Pick<LocationPoint, "lat" | "lng"> | SafeZone) {
  const east =
    (point.lng - origin.lng) *
    111320 *
    Math.cos((((point.lat + origin.lat) / 2) * Math.PI) / 180);
  const north = (point.lat - origin.lat) * 111320;
  return { x: east, y: north };
}

export function lineDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizeBreadcrumbs<T>(points: T[], limit: number) {
  return points.slice(-limit);
}

export function detectPacing(points: Array<{ x: number; y: number; timestamp: number }>) {
  if (points.length < 6) {
    return { active: false, crossings: 0, span: 0, width: 0 };
  }

  let maxDistance = 0;
  let anchorA = points[0];
  let anchorB = points[points.length - 1];

  for (let index = 0; index < points.length; index += 1) {
    for (let inner = index + 1; inner < points.length; inner += 1) {
      const candidate = lineDistance(points[index], points[inner]);
      if (candidate > maxDistance) {
        maxDistance = candidate;
        anchorA = points[index];
        anchorB = points[inner];
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
  const projections = points.map((point) => ({
    along: point.x * axis.x + point.y * axis.y,
    across: point.x * orth.x + point.y * orth.y,
  }));

  const alongValues = projections.map((entry) => entry.along);
  const acrossValues = projections.map((entry) => entry.across);
  const minAlong = Math.min(...alongValues);
  const maxAlong = Math.max(...alongValues);
  const midpoint = (minAlong + maxAlong) / 2;
  const span = maxAlong - minAlong;
  const width = Math.max(...acrossValues) - Math.min(...acrossValues);
  const threshold = Math.max(6, span * 0.16);

  let crossings = 0;
  let previousSide = 0;

  projections.forEach((entry) => {
    const delta = entry.along - midpoint;
    const side = Math.abs(delta) < threshold ? 0 : Math.sign(delta);
    if (side !== 0 && previousSide !== 0 && side !== previousSide) {
      crossings += 1;
    }
    if (side !== 0) previousSide = side;
  });

  const active = span >= 28 && width <= 18 && crossings >= 4;
  return { active, crossings, span, width };
}

export function detectDwelling(
  points: Array<{ x: number; y: number; timestamp: number }>,
  currentDistance: number,
  safeZoneRadius: number,
) {
  if (points.length < 2) {
    return { active: false, diagonal: 0, duration: 0, width: 0, height: 0 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const diagonal = Math.hypot(width, height);
  const duration = points[points.length - 1].timestamp - points[0].timestamp;
  const active = currentDistance > safeZoneRadius && duration >= 15 * 60 * 1000 && diagonal < 10;

  return { active, diagonal, duration, width, height };
}

export function analyzeLocation(breadcrumbs: LocationPoint[], safeZone: SafeZone) {
  const latest = breadcrumbs[breadcrumbs.length - 1] || null;
  const currentDistance = latest ? haversineMeters(latest, safeZone) : 0;
  const outOfBounds = currentDistance > safeZone.radiusM;

  const pacingWindow = breadcrumbs
    .filter((point) => latest && latest.timestamp - point.timestamp <= 5 * 60 * 1000)
    .map((point) => ({ ...toLocalMeters(point, safeZone), timestamp: point.timestamp }));

  const dwellingWindow = breadcrumbs
    .filter((point) => latest && latest.timestamp - point.timestamp <= 15 * 60 * 1000)
    .map((point) => ({ ...toLocalMeters(point, safeZone), timestamp: point.timestamp }));

  return {
    latest,
    currentDistance,
    outOfBounds,
    pacing: detectPacing(pacingWindow),
    dwelling: detectDwelling(dwellingWindow, currentDistance, safeZone.radiusM),
    breadcrumbTrail: breadcrumbs,
    localTrail: breadcrumbs.map((point) => ({
      ...toLocalMeters(point, safeZone),
      timestamp: point.timestamp,
    })),
  };
}

export function analyzeGait(samples) {
  const recent = samples.slice(-150);
  if (recent.length < 30) {
    return {
      label: "Calibrating",
      color: "text-cyan",
      zStd: 0,
      yStd: 0,
      xStd: 0,
      fallDetected: false,
      riskScore: 0.18,
      magnitudeStd: 0,
      peakMagnitude: 0,
      signals: {
        verticalLift: 0,
        forwardConsistency: 0,
        lateralDrift: 0,
        impactSpike: 0,
        postImpactStillness: 0,
      },
    };
  }

  const xs = recent.map((sample) => sample.x);
  const ys = recent.map((sample) => sample.y);
  const zs = recent.map((sample) => sample.z);
  const mags = recent.map((sample) => sample.magnitude);

  const xStd = stdDev(xs);
  const yStd = stdDev(ys);
  const zStd = stdDev(zs);
  const magnitudeStd = stdDev(mags);
  const peakMagnitude = Math.max(...mags);

  let fallDetected = false;
  for (let index = 8; index < recent.length - 24; index += 1) {
    if (recent[index].magnitude > 6.5) {
      const tail = recent.slice(index + 1, index + 26);
      if (tail.length && stdDev(tail.map((sample) => sample.magnitude)) < 0.12) {
        fallDetected = true;
        break;
      }
    }
  }

  const shuffling = zStd < 0.2 && yStd < 0.22 && xStd > 0.18;
  const irregular = !fallDetected && !shuffling && zStd < 0.45;

  const signals = {
    verticalLift: clamp((0.24 - zStd) / 0.24, 0, 1),
    forwardConsistency: clamp((0.26 - yStd) / 0.26, 0, 1),
    lateralDrift: clamp((xStd - 0.1) / 0.28, 0, 1),
    impactSpike: clamp((peakMagnitude - 3.5) / 3.2, 0, 1),
    postImpactStillness: clamp((0.16 - magnitudeStd) / 0.16, 0, 1),
  };

  let label = "Normal";
  let color = "text-emerald-300";
  const baseRisk = clamp(
    0.12 +
      signals.verticalLift * 0.22 +
      signals.forwardConsistency * 0.16 +
      signals.lateralDrift * 0.28 +
      signals.impactSpike * 0.12 +
      signals.postImpactStillness * 0.1,
    0.12,
    0.92,
  );
  let riskScore = baseRisk;

  if (fallDetected) {
    label = "Fall detected";
    color = "text-signal";
    riskScore = 0.98;
  } else if (shuffling || baseRisk >= 0.72) {
    label = "High fall risk";
    color = "text-amber-300";
    riskScore = Math.max(baseRisk, 0.78);
  } else if (irregular || baseRisk >= 0.46) {
    label = "Irregular";
    color = "text-cyan";
    riskScore = Math.max(baseRisk, 0.54);
  }

  return {
    label,
    color,
    zStd,
    yStd,
    xStd,
    magnitudeAvg: average(mags),
    magnitudeStd,
    peakMagnitude,
    fallDetected,
    riskScore,
    signals,
  };
}

export function eyeAspectRatio(keypoints, indices) {
  if (!indices.every((index) => keypoints[index])) return 0;
  const [left, topA, topB, right, bottomA, bottomB] = indices.map((index) => keypoints[index]);
  const vertical =
    (Math.hypot(topA.x - bottomA.x, topA.y - bottomA.y) +
      Math.hypot(topB.x - bottomB.x, topB.y - bottomB.y)) /
    2;
  const horizontal = Math.hypot(left.x - right.x, left.y - right.y) || 1;
  return vertical / horizontal;
}

export function averagePoint(points) {
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  };
}

export function targetPosition(elapsedMs, width, height) {
  const phaseMs = 4000;
  const lane = Math.floor(elapsedMs / phaseMs) % 4;
  const progress = (elapsedMs % phaseMs) / phaseMs;
  const paddingX = width * 0.16;
  const paddingY = height * 0.18;

  if (lane === 0) {
    return { x: paddingX + (width - paddingX * 2) * progress, y: height * 0.3, lane };
  }
  if (lane === 1) {
    return { x: width - paddingX, y: paddingY + (height - paddingY * 2) * progress, lane };
  }
  if (lane === 2) {
    return { x: width - paddingX - (width - paddingX * 2) * progress, y: height * 0.72, lane };
  }
  return { x: paddingX, y: height - paddingY - (height - paddingY * 2) * progress, lane };
}

export function toSvgPath(values, width, height, padding = 18) {
  if (values.length < 2) return "";
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function mapTelemetryTrail(localTrail, safeZoneRadius) {
  if (!localTrail.length) return { points: [], bounds: null, radius: 56, current: null };

  const xs = localTrail.map((point) => point.x);
  const ys = localTrail.map((point) => point.y);
  const limit = 220;
  const half = Math.max(limit, Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)) + 40);
  const project = (point) => ({
    x: 160 + (point.x / half) * 120,
    y: 120 - (point.y / half) * 90,
  });

  return {
    points: localTrail.map(project),
    radius: (safeZoneRadius / half) * 120,
    current: project(localTrail[localTrail.length - 1]),
  };
}
