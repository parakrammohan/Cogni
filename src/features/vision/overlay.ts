import {
  LEFT_EYE_CONTOUR,
  LEFT_IRIS_CENTER,
  LEFT_IRIS_EDGE,
  RIGHT_EYE_CONTOUR,
  RIGHT_IRIS_CENTER,
  RIGHT_IRIS_EDGE,
} from "./landmarks";
import type { NormalizedLandmark } from "./ear";

interface DrawOptions {
  ctx: CanvasRenderingContext2D;
  /** Normalized 0-1 landmarks from MediaPipe. */
  landmarks: readonly NormalizedLandmark[];
  width: number;
  height: number;
  /** When true, x-coordinates are mirrored (matches a `transform: scaleX(-1)` video). */
  mirror: boolean;
}

const MESH_DOT_FILL = "rgba(109, 226, 255, 0.45)";
const EYE_STROKE = "rgba(110, 231, 183, 0.95)";
const IRIS_STROKE = "rgba(255, 220, 0, 0.95)";
const IRIS_CROSSHAIR = "rgba(255, 220, 0, 0.4)";

function project(point: NormalizedLandmark, width: number, height: number, mirror: boolean) {
  const x = mirror ? width - point.x * width : point.x * width;
  return { x, y: point.y * height };
}

function distancePx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Draws a stylized face-mesh overlay: sparse landmark dots, eye contours, iris crosshairs.
 * Pure: clears its own region and draws — does not mutate landmark data.
 */
export function drawFaceMesh({ ctx, landmarks, width, height, mirror }: DrawOptions) {
  ctx.clearRect(0, 0, width, height);

  // Sparse mesh dots (every 4th landmark)
  ctx.fillStyle = MESH_DOT_FILL;
  for (let i = 0; i < landmarks.length; i += 4) {
    const lm = landmarks[i];
    if (!lm) continue;
    const p = project(lm, width, height, mirror);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye contours
  drawContour(ctx, landmarks, LEFT_EYE_CONTOUR, width, height, mirror);
  drawContour(ctx, landmarks, RIGHT_EYE_CONTOUR, width, height, mirror);

  // Iris circles
  if (landmarks.length > RIGHT_IRIS_CENTER) {
    const lc = landmarks[LEFT_IRIS_CENTER];
    const le = landmarks[LEFT_IRIS_EDGE];
    const rc = landmarks[RIGHT_IRIS_CENTER];
    const re = landmarks[RIGHT_IRIS_EDGE];
    if (lc && le) drawIris(ctx, project(lc, width, height, mirror), project(le, width, height, mirror));
    if (rc && re) drawIris(ctx, project(rc, width, height, mirror), project(re, width, height, mirror));
  }
}

function drawContour(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly NormalizedLandmark[],
  indices: readonly number[],
  width: number,
  height: number,
  mirror: boolean,
) {
  ctx.strokeStyle = EYE_STROKE;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  let started = false;
  for (const idx of indices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const p = project(lm, width, height, mirror);
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
  ctx.stroke();
}

function drawIris(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  edge: { x: number; y: number },
) {
  const radius = Math.max(distancePx(center, edge), 4);

  ctx.strokeStyle = IRIS_STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = IRIS_CROSSHAIR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(center.x - radius * 1.3, center.y);
  ctx.lineTo(center.x + radius * 1.3, center.y);
  ctx.moveTo(center.x, center.y - radius * 1.3);
  ctx.lineTo(center.x, center.y + radius * 1.3);
  ctx.stroke();
}

/**
 * Draws the simulated-gaze overlay (no live landmarks): grid + moving target + simulated gaze dot.
 */
export function drawSimulationOverlay(
  ctx: CanvasRenderingContext2D,
  target: { x: number; y: number },
  gaze: { x: number; y: number },
  width: number,
  height: number,
  meta: { fixation: number; latency: number; source: string },
) {
  ctx.clearRect(0, 0, width, height);

  // Subtle background
  ctx.fillStyle = "rgba(8, 17, 26, 0.45)";
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Target ring
  ctx.fillStyle = "rgba(255, 111, 77, 0.95)";
  ctx.beginPath();
  ctx.arc(target.x, target.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 111, 77, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 16, 0, Math.PI * 2);
  ctx.stroke();

  // Gaze dot + tether
  ctx.fillStyle = "rgba(109, 226, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(gaze.x, gaze.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(109, 226, 255, 0.26)";
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  ctx.lineTo(gaze.x, gaze.y);
  ctx.stroke();

  // Telemetry corner
  ctx.fillStyle = "#edf5f2";
  ctx.font = "600 12px IBM Plex Sans, sans-serif";
  ctx.fillText(`Latency ${Math.round(meta.latency)}ms`, 18, 22);
  ctx.fillText(`Fixation ${Math.round(meta.fixation)}%`, 18, 40);
  ctx.fillText(meta.source, 18, 58);
}
