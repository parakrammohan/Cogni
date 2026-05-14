import { motion } from "framer-motion";

import type { GazeFeatures } from "./calibration";

interface HeadPoseWidgetProps {
  /** Head pose from MediaPipe's facialTransformationMatrix. Null when no
   *  face lock — we show a calm placeholder so the widget still appears. */
  features: GazeFeatures | null;
}

/**
 * Tiny "where's the head pointing" indicator for the camera HUD.
 *
 * Layout: a small SVG sphere wireframe rotated in CSS 3D space by the live
 * head pose, with a forward-direction arrow drawn from the centre. The
 * arrow tip is the projected gaze vector — sin(yaw) on x, -sin(pitch) on
 * y — so it points to wherever the patient is facing relative to the
 * camera.
 *
 * Driven by GazeFeatures.headYaw / headPitch / headRoll (radians).
 */
export function HeadPoseWidget({ features }: HeadPoseWidgetProps) {
  const yaw = features?.headYaw ?? 0;
  const pitch = features?.headPitch ?? 0;
  const roll = features?.headRoll ?? 0;

  // Forward-vector tip in widget coords (centre = 0,0; widget radius ≈ 32).
  const r = 28;
  const tipX = Math.sin(yaw) * r;
  const tipY = -Math.sin(pitch) * r;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      {/* 3D head silhouette — small enough not to obscure anything. */}
      <div
        className="relative h-20 w-20"
        style={{ perspective: "120px" }}
      >
        {/* Forward-direction vector: drawn behind the head so the arrow
            head appears to come out of the face when looking sideways. */}
        <svg
          viewBox="-40 -40 80 80"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <marker
              id="head-arrow"
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
          <line
            x1={0}
            y1={0}
            x2={tipX}
            y2={tipY}
            stroke="#22d3ee"
            strokeWidth={2}
            strokeLinecap="round"
            markerEnd="url(#head-arrow)"
            opacity={features ? 1 : 0.35}
          />
        </svg>

        {/* The head itself — a 3D-rotated rounded shape with eye dots so
            the orientation reads at a glance. */}
        <motion.div
          className="absolute inset-1/2 h-14 w-12 -translate-x-1/2 -translate-y-1/2"
          style={{
            transformStyle: "preserve-3d",
            // Roll on the screen plane, yaw left/right around vertical,
            // pitch up/down around horizontal. Negate pitch so chin-up
            // tilts the head toward the camera (intuitive).
            transform: `rotateZ(${(roll * 180) / Math.PI}deg) rotateY(${
              (yaw * 180) / Math.PI
            }deg) rotateX(${(-pitch * 180) / Math.PI}deg)`,
          }}
          aria-hidden
        >
          {/* Face plane */}
          <div className="absolute inset-0 rounded-[40%] bg-gradient-to-br from-cyan-200/90 to-cyan-400/90 shadow-md">
            {/* Eyes */}
            <span className="absolute left-[26%] top-[38%] h-1.5 w-1.5 rounded-full bg-slate-900" />
            <span className="absolute right-[26%] top-[38%] h-1.5 w-1.5 rounded-full bg-slate-900" />
            {/* Mouth */}
            <span className="absolute left-1/2 top-[68%] h-[2px] w-3 -translate-x-1/2 rounded-full bg-slate-900/70" />
          </div>
        </motion.div>
      </div>

      <div className="rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white shadow-md backdrop-blur-md">
        {features ? "Head pose" : "No face"}
      </div>
    </div>
  );
}
