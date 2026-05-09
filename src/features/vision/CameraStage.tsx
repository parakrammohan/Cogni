import { Camera } from "lucide-react";
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
  /** When false, the stage is hidden offscreen but the video element stays mounted. */
  visible: boolean;
  /** Visual intent. "hero" = primary surface; "secondary" = preview. */
  intent?: "hero" | "secondary";
}

/**
 * Always-mounted camera surface. The video and canvas elements are rendered
 * exactly once at this position so their refs stay stable across:
 *   1) the user navigating between scenes
 *   2) toggling the camera on/off
 *
 * Visual states:
 *   - Camera OFF: a calm cyan/sky CTA card matching the Pursuit empty state.
 *                 The video + canvas sit underneath at opacity-0 so the
 *                 stream can re-attach instantly when the user enables it.
 *   - Camera LIVE: a dark stage with the live mesh overlay and metric chips.
 */
export function CameraStage({
  videoRef,
  canvasRef,
  cameraStatus,
  visionMetrics,
  onToggleCamera,
  visible,
  intent: _intent = "hero",
}: CameraStageProps) {
  void _intent;
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
          "relative w-full overflow-hidden rounded-3xl shadow-(--shadow-soft) transition-[background-color,border-color,aspect-ratio,padding] duration-300",
          // Live: 16:9 stage so the video sits cleanly. Off: compact card height so
          // the CTA doesn't dominate the viewport on wide screens.
          live ? "aspect-video border border-slate-900 bg-black" : "border border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white",
        )}
      >
        {/* Always-mounted video + canvas — refs stay on the same elements */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Live camera feed for ocular screening"
          className={cx(
            "absolute inset-0 h-full w-full object-cover transition-opacity",
            live ? "opacity-90" : "opacity-0",
          )}
        />
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cx(
            "absolute inset-0 h-full w-full transition-opacity",
            live ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Live overlays */}
        {live ? (
          <>
            <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              <span
                className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]"
                aria-hidden
              />
              Live
            </div>

            {visionMetrics.faceDetected ? (
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
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6">
                <div className="rounded-full bg-white/10 px-4 py-2 text-xs text-white backdrop-blur-md">
                  Looking for a face… align with the camera
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Camera-off CTA — in normal flow so it sets the parent's natural height
            (compact), instead of the parent forcing an aspect-video block. */}
        {!live ? (
          <div className="relative flex flex-col items-start gap-3 px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
              <Camera size={20} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Camera off</h3>
              <p className="mt-0.5 text-sm leading-5 text-slate-700">
                Enable the camera to start live face-mesh tracking and ocular biomarkers.
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleCamera}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <Camera size={16} aria-hidden />
              Enable camera
            </button>
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
