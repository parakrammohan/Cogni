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
const CUBE = 56; // CSS-3D scene size in px

/**
 * Live head-tracking debug widget.
 *
 * Left:  mini face mesh, redrawn each frame from the latest landmarks.
 *        Mirrored to match the selfie-style camera view (CSS scale flip,
 *        same as the main hero canvas).
 *
 * Right: a real 3D scene — a small wireframe cube rotated by the head
 *        pose, with a brightly-coloured "forward" face and a 3D arrow
 *        sticking out of it along the local +Z axis. As the patient
 *        turns their head, the cube rotates and the arrow visibly tilts
 *        in 3D space rather than just sliding around a flat dial.
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
            // mirror=false — the canvas itself is CSS-flipped, same as
            // the main hero canvas and the live video, so the mesh
            // appears as the user sees themselves.
            drawFaceMesh({
              ctx,
              landmarks,
              width: MESH_W,
              height: MESH_H,
              mirror: false,
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

  // CSS 3D needs degrees; MediaPipe gives radians. Yaw is negated so the
  // cube rotates the same direction the user sees themselves turn (selfie
  // mirror convention).
  const yawDeg = features ? (-features.headYaw * 180) / Math.PI : 0;
  const pitchDeg = features ? (-features.headPitch * 180) / Math.PI : 0;
  const rollDeg = features ? (features.headRoll * 180) / Math.PI : 0;
  const sceneTransform = `rotateZ(${rollDeg}deg) rotateY(${yawDeg}deg) rotateX(${pitchDeg}deg)`;

  const half = CUBE / 2;
  // Wireframe + face palette
  const faceBg = "rgba(34, 211, 238, 0.18)";
  const faceFront = "rgba(34, 211, 238, 0.85)";
  const faceBorder = "1px solid rgba(34, 211, 238, 0.85)";

  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-2xl bg-black/55 p-2 shadow-md backdrop-blur-md">
      {/* Mini face mesh */}
      <div className="flex flex-col items-center gap-1">
        <canvas
          ref={canvasRef}
          aria-hidden
          // Mirror so the mesh matches the selfie-style video feed.
          className="rounded-md scale-x-[-1] ring-1 ring-white/15"
          style={{ width: MESH_W, height: MESH_H }}
        />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80">
          Mesh
        </span>
      </div>

      {/* 3D arrow scene */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="rounded-md ring-1 ring-white/15"
          style={{
            width: CUBE,
            height: CUBE,
            perspective: 160,
            background: "rgba(15, 23, 42, 0.55)",
            position: "relative",
          }}
          aria-hidden
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              transformStyle: "preserve-3d",
              transform: sceneTransform,
            }}
          >
            {/* Wireframe cube. The front face (+Z) is the brightly
                coloured one so the arrow stays visually tied to it. */}
            <Face
              transform={`translateZ(${half}px)`}
              background={faceFront}
              border={faceBorder}
              size={CUBE}
            />
            <Face
              transform={`translateZ(-${half}px) rotateY(180deg)`}
              background={faceBg}
              border={faceBorder}
              size={CUBE}
            />
            <Face
              transform={`rotateY(90deg) translateZ(${half}px)`}
              background={faceBg}
              border={faceBorder}
              size={CUBE}
            />
            <Face
              transform={`rotateY(-90deg) translateZ(${half}px)`}
              background={faceBg}
              border={faceBorder}
              size={CUBE}
            />
            <Face
              transform={`rotateX(90deg) translateZ(${half}px)`}
              background={faceBg}
              border={faceBorder}
              size={CUBE}
            />
            <Face
              transform={`rotateX(-90deg) translateZ(${half}px)`}
              background={faceBg}
              border={faceBorder}
              size={CUBE}
            />

            {/* 3D arrow shaft — a thin colored bar extruded along +Z.
                Two thin perpendicular planes give it visible thickness
                even when viewed edge-on. */}
            <ArrowShaft size={CUBE} />
            <ArrowHead size={CUBE} />
          </div>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80">
          {features ? "Facing" : "No face"}
        </span>
      </div>
    </div>
  );
}

function Face({
  transform,
  background,
  border,
  size,
}: {
  transform: string;
  background: string;
  border: string;
  size: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size,
        height: size,
        transform,
        background,
        border,
        backfaceVisibility: "visible",
      }}
    />
  );
}

/** Two perpendicular thin planes glued along the same axis form a "thick"
 *  line that looks like a 3D shaft from any angle. */
function ArrowShaft({ size }: { size: number }) {
  const half = size / 2;
  const len = half + 8; // extends past the front face
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: half - 1.5,
          top: half - 1.5,
          width: 3,
          height: 3,
          background: "#22d3ee",
          transform: `translateZ(${half + len / 2}px) rotateX(90deg) scaleY(${len / 3})`,
          transformOrigin: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: half - 1.5,
          top: half - 1.5,
          width: 3,
          height: 3,
          background: "#22d3ee",
          transform: `translateZ(${half + len / 2}px) rotateY(90deg) scaleY(${len / 3})`,
          transformOrigin: "center",
        }}
      />
    </>
  );
}

/** A triangular arrowhead made of three planes meeting at the tip. */
function ArrowHead({ size }: { size: number }) {
  const half = size / 2;
  const z = half + 18; // tip distance from cube centre
  const baseZ = half + 8; // back of head
  // Build a tetrahedron by stacking 3 narrow triangular sheets at 120°.
  return (
    <>
      {[0, 120, 240].map((ang) => (
        <div
          key={ang}
          style={{
            position: "absolute",
            left: half - 6,
            top: half,
            width: 12,
            height: 12,
            background: "#22d3ee",
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            transformOrigin: "center top",
            transform: `translateZ(${(z + baseZ) / 2}px) translateY(-6px) rotateY(${ang}deg) rotateX(90deg)`,
          }}
        />
      ))}
    </>
  );
}
