import { useEffect, useRef, type RefObject } from "react";

import type { NormalizedLandmark } from "./ear";
import type { Connection } from "./overlay";
import { drawFaceMesh } from "./overlay";
import type { GazeFeatures } from "./calibration";

interface HeadPoseWidgetProps {
  /** Live head pose. Drives the forward-direction arrow. */
  features: GazeFeatures | null;
  /** Latest face landmarks. Ref so we don't push 478 floats through React
   *  state every frame. */
  landmarksRef: RefObject<NormalizedLandmark[] | null>;
  /** Getter for the static mesh tessellation. */
  getTessellation: () => readonly Connection[] | undefined;
}

const MESH_W = 110;
const MESH_H = 88;
const ARROW_R = 22; // pixel radius of the arrow circle around the head

/**
 * Tiny live preview of the face mesh + a forward-direction arrow.
 *
 * The mesh canvas re-renders every frame from the latest landmarks (read
 * through a ref to avoid React state churn). The arrow points to
 * (sin yaw, -sin pitch) so it sweeps with the patient's head direction,
 * staying anchored at the centre of a small SVG dial beside the mesh.
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

  const yaw = features?.headYaw ?? 0;
  const pitch = features?.headPitch ?? 0;
  // Forward vector projection: positive yaw turns the head's facing
  // direction to the patient's right (camera's left, but with the
  // mirrored display that lines up with what they see). +Y in screen
  // space is down, so we negate pitch.
  const arrowX = Math.sin(yaw) * ARROW_R;
  const arrowY = -Math.sin(pitch) * ARROW_R;

  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-2xl bg-black/55 p-2 shadow-md backdrop-blur-md">
      {/* Mini face mesh */}
      <div className="flex flex-col items-center gap-1">
        <canvas
          ref={canvasRef}
          aria-hidden
          className="rounded-md ring-1 ring-white/15"
          style={{ width: MESH_W, height: MESH_H }}
        />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80">
          Mesh
        </span>
      </div>

      {/* Direction arrow */}
      <div className="flex flex-col items-center gap-1">
        <svg
          viewBox={`-${ARROW_R + 4} -${ARROW_R + 4} ${2 * (ARROW_R + 4)} ${2 * (ARROW_R + 4)}`}
          className="rounded-full ring-1 ring-white/15"
          style={{ width: 56, height: 56, background: "rgba(15, 23, 42, 0.55)" }}
          aria-hidden
        >
          <defs>
            <marker
              id="hp-arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee" />
            </marker>
          </defs>
          {/* Reference cross */}
          <line
            x1={-ARROW_R}
            y1={0}
            x2={ARROW_R}
            y2={0}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={-ARROW_R}
            x2={0}
            y2={ARROW_R}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1}
          />
          {/* Head-direction arrow */}
          <line
            x1={0}
            y1={0}
            x2={arrowX}
            y2={arrowY}
            stroke="#22d3ee"
            strokeWidth={2.4}
            strokeLinecap="round"
            markerEnd="url(#hp-arrow)"
            opacity={features ? 1 : 0.3}
          />
          <circle cx={0} cy={0} r={2} fill="#22d3ee" />
        </svg>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80">
          {features ? "Facing" : "No face"}
        </span>
      </div>
    </div>
  );
}
