import {
  LEFT_EYE_CONTOUR,
  LEFT_IRIS_BOUNDARY,
  LEFT_IRIS_CENTER,
  RIGHT_EYE_CONTOUR,
  RIGHT_IRIS_BOUNDARY,
  RIGHT_IRIS_CENTER,
} from "./landmarks";
import type { NormalizedLandmark } from "./ear";

/** Connection pair between two landmark indices (matches MediaPipe's type). */
export type Connection = { start: number; end: number };

interface DrawOptions {
  ctx: CanvasRenderingContext2D;
  /** Normalized 0-1 landmarks from MediaPipe. */
  landmarks: readonly NormalizedLandmark[];
  width: number;
  height: number;
  /** When true, x-coordinates are mirrored (matches a `transform: scaleX(-1)` video). */
  mirror: boolean;
  /** Full face-mesh tessellation. When provided, drawn as faint wireframe lines
   *  giving a proper "mesh" look. Comes from `FaceLandmarker.FACE_LANDMARKS_TESSELATION`. */
  tesselation?: readonly Connection[];
}

const MESH_DOT_FILL = "rgba(109, 226, 255, 0.7)";
const TESSELATION_STROKE = "rgba(109, 226, 255, 0.18)";
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
 * Draws the face mesh overlay:
 *   - Full tessellation wireframe (every triangle edge between the 478
 *     landmarks) — the classic "mesh" look. Driven by MediaPipe's static
 *     FACE_LANDMARKS_TESSELATION connection list.
 *   - All 478 landmarks as tiny cyan dots.
 *   - Eye contours and iris circles in distinct colors so they stand out
 *     against the wireframe.
 *
 * Pure: clears its own region and draws — does not mutate landmark data.
 */
export function drawFaceMesh({ ctx, landmarks, width, height, mirror, tesselation }: DrawOptions) {
  ctx.clearRect(0, 0, width, height);

  // Mesh wireframe. We batch into a single Path2D so the GPU strokes
  // all ~2000 edges in one call rather than ~2000 per-line strokes.
  if (tesselation && tesselation.length > 0) {
    ctx.strokeStyle = TESSELATION_STROKE;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const conn of tesselation) {
      const a = landmarks[conn.start];
      const b = landmarks[conn.end];
      if (!a || !b) continue;
      const pa = project(a, width, height, mirror);
      const pb = project(b, width, height, mirror);
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();
  }

  // All 478 landmarks as small dots.
  ctx.fillStyle = MESH_DOT_FILL;
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;
    const p = project(lm, width, height, mirror);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye contours — pop against the mesh.
  drawContour(ctx, landmarks, LEFT_EYE_CONTOUR, width, height, mirror);
  drawContour(ctx, landmarks, RIGHT_EYE_CONTOUR, width, height, mirror);

  // Iris quads + pupil crosshair. We use all four iris-boundary points
  // (inner / top / outer / bottom) so the drawn outline traces the
  // actual elliptical edge of the iris rather than approximating it
  // with a circle from a single radius sample.
  if (landmarks.length > 477) {
    const lc = landmarks[LEFT_IRIS_CENTER];
    const rc = landmarks[RIGHT_IRIS_CENTER];
    const leftBoundary = LEFT_IRIS_BOUNDARY.map((i) => landmarks[i]).filter(
      Boolean,
    ) as NormalizedLandmark[];
    const rightBoundary = RIGHT_IRIS_BOUNDARY.map((i) => landmarks[i]).filter(
      Boolean,
    ) as NormalizedLandmark[];
    if (lc && leftBoundary.length === 4) {
      drawIris(
        ctx,
        project(lc, width, height, mirror),
        leftBoundary.map((p) => project(p, width, height, mirror)),
      );
    }
    if (rc && rightBoundary.length === 4) {
      drawIris(
        ctx,
        project(rc, width, height, mirror),
        rightBoundary.map((p) => project(p, width, height, mirror)),
      );
    }
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
  boundary: Array<{ x: number; y: number }>,
) {
  // Iris outline: trace the four boundary points (inner / top / outer /
  // bottom) as a closed polygon. This follows the actual elliptical
  // edge of the iris under perspective instead of approximating with a
  // single-radius circle.
  ctx.strokeStyle = IRIS_STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  boundary.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();

  // Crosshair through the pupil centre. Sizes derived from the average
  // boundary distance so the marks stay proportional regardless of how
  // close the user is to the camera.
  const radius = Math.max(
    boundary.reduce((sum, p) => sum + distancePx(center, p), 0) / boundary.length,
    4,
  );

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
