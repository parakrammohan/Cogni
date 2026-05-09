import { Camera, EyeOff } from "lucide-react";
import type { RefObject } from "react";

import { cx } from "../../lib/utils";
import type { SensorState } from "../../types/app";
import type { VisionMetrics } from "./types";

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraStatus: SensorState;
  visionMetrics: VisionMetrics;
  onToggleCamera: () => void;
  /** When false, the stage is hidden visually but the video element stays mounted. */
  visible: boolean;
  /**
   * Visual intent. "hero" = large, primary surface (ocular tab).
   * "secondary" = smaller preview (pursuit tab).
   */
  intent?: "hero" | "secondary";
}

/**
 * Always-mounted camera surface. The video and canvas elements live here at the
 * PatientView root so they survive scene transitions — switching tabs no longer
 * tears down the camera stream or the MediaPipe inference loop.
 *
 * When `visible` is false, the stage is positioned offscreen but kept rendered,
 * so the video keeps playing and `useVision` keeps producing metrics.
 */
export function CameraStage({
  videoRef,
  canvasRef,
  cameraStatus,
  visionMetrics,
  onToggleCamera,
  visible,
  intent = "hero",
}: CameraStageProps) {
  const live = cameraStatus === "live";
  return (
    <div
      aria-hidden={!visible}
      className={cx(
        "transition-opacity duration-300",
        visible
          ? "opacity-100"
          : "pointer-events-none fixed -left-[9999px] top-0 h-1 w-1 overflow-hidden opacity-0",
      )}
    >
      <div
        className={cx(
          "relative w-full overflow-hidden rounded-3xl border border-slate-900 bg-black shadow-(--shadow-elevated)",
          intent === "hero" ? "aspect-[4/5] sm:aspect-video" : "aspect-video",
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Live camera feed for ocular screening"
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 h-full w-full"
        />

        {/* Top-left status pill */}
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
          <span
            className={cx(
              "h-2 w-2 rounded-full",
              live ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" : "bg-slate-400",
            )}
            aria-hidden
          />
          {live ? "Live" : "Camera off"}
        </div>

        {/* Live metric overlay */}
        {live && visionMetrics.faceDetected ? (
          <div className="absolute bottom-3 left-3 right-3 grid grid-cols-3 gap-2">
            <Chip label="EAR" value={visionMetrics.ear.toFixed(2)} />
            <Chip label="Blinks/min" value={visionMetrics.blinkRate.toFixed(0)} />
            <Chip
              label="Risk"
              value={visionMetrics.risk}
              accent={
                visionMetrics.risk === "High"
                  ? "text-red-300"
                  : visionMetrics.risk === "Moderate"
                    ? "text-amber-300"
                    : "text-emerald-300"
              }
            />
          </div>
        ) : null}

        {!live ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/8 text-white backdrop-blur">
              <EyeOff size={28} aria-hidden />
            </div>
            <div className="max-w-xs text-slate-100">
              <h3 className="text-lg font-semibold">Camera is off</h3>
              <p className="mt-1.5 text-sm text-slate-300">
                Enable the camera to begin live face-mesh tracking and screening.
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleCamera}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-md transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <Camera size={16} aria-hidden />
              Enable camera
            </button>
          </div>
        ) : null}

        {live && !visionMetrics.faceDetected ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-20">
            <div className="rounded-full bg-white/10 px-4 py-2 text-xs text-white backdrop-blur-md">
              Looking for a face… align with the camera
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur-md">
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className={cx("mt-0.5 text-base font-semibold", accent)}>{value}</div>
    </div>
  );
}
