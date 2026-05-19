import { useEffect, useRef, type RefObject } from "react";

import type { NormalizedLandmark } from "./ear";
import type { Connection } from "./overlay";
import { drawFaceMesh } from "./overlay";
import type { GazeFeatures } from "./calibration";

interface HeadPoseWidgetProps {
  /** Live head pose. Drives the 3D arrow direction. */
  features: GazeFeatures | null;
  /** Latest face landmarks. Ref so we don't push 478 floats through React
   *  state every frame. */
  landmarksRef: RefObject<NormalizedLandmark[] | null>;
  /** Getter for the static mesh tessellation. */
  getTessellation: () => readonly Connection[] | undefined;
}

const MESH_W = 110;
const MESH_H = 88;
const SCENE = 88; // arrow scene viewport size in px
const ARROW_LEN = 0.78; // arrow length as fraction of half-scene

/**
 * Live head-tracking debug widget.
 *
 * Left:  mini face mesh, redrawn each frame from the latest landmarks.
 *        Same mirror convention as the main camera view.
 *
 * Right: a 3D arrow whose tail sits at the centre of the scene and
 *        whose tip projects out into 3D space in the direction the
 *        patient's head is pointing. The arrow is drawn with an SVG
 *        perspective projection — origin sphere shrinks toward
 *        whichever depth axis the head is facing, arrow shaft and
 *        arrowhead are computed from the 3D forward vector each
 *        frame. When the patient looks forward you see a short stub
 *        coming straight out at you; when they turn 45° you see a
 *        long arrow tilted toward the corner.
 */
export function HeadPoseWidget({
  features,
  landmarksRef,
  getTessellation,
}: HeadPoseWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Per-frame mesh redraw. Reads landmarks from the ref so we don't pay
  // a React rerender per frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        if (canvas.width !== MESH_W || canvas.height !== MESH_H) {
          canvas.width = MESH_W;
          canvas.height = MESH_H;
        }
        const ctx = canvas.getContext("2d");
        const landmarks = landmarksRef.current;
        if (ctx) {
          ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
          ctx.fillRect(0, 0, MESH_W, MESH_H);
          if (landmarks && landmarks.length > 0) {
            drawFaceMesh({
              ctx,
              landmarks,
              width: MESH_W,
              height: MESH_H,
              mirror: true,
              tesselation: getTessellation(),
            });
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [landmarksRef, getTessellation]);

  return (
    <div className="pointer-events-none flex items-end gap-2 rounded-2xl bg-black/55 p-2 shadow-md backdrop-blur-md">
      <Column label="Mesh">
        <canvas
          ref={canvasRef}
          aria-hidden
          className="rounded-md ring-1 ring-white/15"
          style={{ width: MESH_W, height: MESH_H }}
        />
      </Column>

      <Column label={features ? "Facing" : "No face"}>
        <ForwardArrow features={features} size={SCENE} />
      </Column>
    </div>
  );
}

/** Bottom-aligned column with a centered caption underneath. Using
 *  `items-end` on the parent flex + `text-center` here keeps the two
 *  captions on the same baseline regardless of how tall the widgets
 *  above them are. */
function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      {children}
      <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/80">
        {label}
      </span>
    </div>
  );
}

/**
 * SVG-projected 3D forward arrow.
 *
 * Forward direction in head-frame at identity is +Z (toward the camera /
 * viewer). After yaw / pitch rotations the unit forward vector becomes
 *
 *   fx =  sin(yaw)  * cos(pitch)
 *   fy = -sin(pitch)
 *   fz =  cos(yaw)  * cos(pitch)
 *
 * Yaw is negated so the arrow follows the selfie-mirror view: when the
 * patient turns their head to their right, the arrow tilts to the
 * viewer's right (which is where the patient sees themselves go in the
 * mirrored video).
 *
 * Perspective projection: classic pinhole. Tip 2D coordinates are
 * `fx * L * D / (D - fz * L)`, with `L` being the arrow length and `D`
 * the viewer distance. This makes the arrow visibly shrink when
 * pointing into / out of the screen and grow when pointing sideways.
 */
function ForwardArrow({
  features,
  size,
}: {
  features: GazeFeatures | null;
  size: number;
}) {
  const yaw = features ? -features.headYaw : 0;
  const pitch = features ? features.headPitch : 0;

  const halfSize = size / 2;
  const L = halfSize * ARROW_LEN;
  const D = size * 1.6; // viewer distance — larger = milder perspective

  const fx = Math.sin(yaw) * Math.cos(pitch);
  const fy = -Math.sin(pitch);
  const fz = Math.cos(yaw) * Math.cos(pitch);

  // Project the 3D tip (fx*L, fy*L, fz*L) through a pinhole at (0,0,-D).
  const denom = D - fz * L;
  const tipX = (fx * L * D) / denom;
  const tipY = (fy * L * D) / denom;

  // Origin marker shrinks when the arrow points toward / away from the
  // viewer — visual depth cue.
  const baseRadius = 4 + 1.5 * (1 - Math.abs(fz));

  // Arrowhead orientation in 2D follows (tipX, tipY) direction.
  const dirLen = Math.hypot(tipX, tipY);
  const ux = dirLen > 0.01 ? tipX / dirLen : 0;
  const uy = dirLen > 0.01 ? tipY / dirLen : -1; // default upward when pointing at viewer
  const px = -uy;
  const py = ux;
  const headLen = 6 + 4 * Math.max(0, fz); // bigger when tip is closer to viewer
  const headHalfWidth = 3.5 + 2 * Math.max(0, fz);
  const hbX = tipX - ux * headLen;
  const hbY = tipY - uy * headLen;
  const h1X = hbX + px * headHalfWidth;
  const h1Y = hbY + py * headHalfWidth;
  const h2X = hbX - px * headHalfWidth;
  const h2Y = hbY - py * headHalfWidth;

  // Faint reference ring + axes so the 3D-ness is unambiguous.
  const ring = halfSize - 6;

  return (
    <svg
      viewBox={`-${halfSize} -${halfSize} ${size} ${size}`}
      width={size}
      height={size}
      className="rounded-md ring-1 ring-white/15"
      style={{ background: "rgba(15, 23, 42, 0.55)" }}
      aria-hidden
    >
      {/* Equatorial ring (looks like a flattened disk under perspective) */}
      <ellipse
        cx={0}
        cy={0}
        rx={ring}
        ry={ring * 0.35}
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={0.8}
      />
      {/* Reference cross — horizontal & vertical */}
      <line x1={-ring} y1={0} x2={ring} y2={0} stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />
      <line x1={0} y1={-ring} x2={0} y2={ring} stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />

      {/* Arrow shaft */}
      <line
        x1={0}
        y1={0}
        x2={tipX}
        y2={tipY}
        stroke="#22d3ee"
        strokeWidth={2.6}
        strokeLinecap="round"
        opacity={features ? 1 : 0.3}
      />
      {/* Arrowhead — triangle pointing from base toward tip */}
      <polygon
        points={`${tipX.toFixed(2)},${tipY.toFixed(2)} ${h1X.toFixed(2)},${h1Y.toFixed(
          2,
        )} ${h2X.toFixed(2)},${h2Y.toFixed(2)}`}
        fill="#22d3ee"
        opacity={features ? 1 : 0.3}
      />
      {/* Tail anchor at origin so the arrow always "starts" at a visible point */}
      <circle cx={0} cy={0} r={baseRadius} fill="#0e7490" stroke="#22d3ee" strokeWidth={1} />
    </svg>
  );
}
