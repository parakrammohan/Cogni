import type { RefObject } from "react";

import StatusBoard from "../../components/ui/StatusBoard";
import { faceLockTone, riskTone, trackerLabel, trackerTone } from "../../lib/tone";
import type { VisionMetrics } from "../../features/vision/types";

interface VisionSceneProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  visionMetrics: VisionMetrics;
}

export function VisionScene({ videoRef, canvasRef, visionMetrics }: VisionSceneProps) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Ocular biomarkers
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          Live mesh overlay and gaze deviation summary fed by MediaPipe Face Landmarker.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-300 bg-slate-900 shadow-(--shadow-card)">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Live camera feed"
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>
        <StatusBoard
          columns="sm:grid-cols-2"
          items={[
            {
              label: "Tracker mode",
              value: trackerLabel(visionMetrics.trackingMode),
              tone: trackerTone(visionMetrics.trackingMode),
              detail:
                visionMetrics.trackingMode === "live-mesh"
                  ? "Ocular landmarks actively locked."
                  : "Ocular capture initializing.",
            },
            {
              label: "Face lock",
              value: visionMetrics.faceDetected ? "Locked" : "Aligning",
              tone: faceLockTone(visionMetrics.faceDetected),
              detail: visionMetrics.faceDetected
                ? `${visionMetrics.landmarkCount} landmarks feeding overlay.`
                : "Awaiting stable eye landmarks.",
            },
            {
              label: "Ocular risk",
              value: visionMetrics.risk,
              tone: riskTone(visionMetrics.risk),
              detail: `EAR ${visionMetrics.ear.toFixed(2)}, blinks ${visionMetrics.blinkRate.toFixed(1)}/min.`,
            },
            {
              label: "Gaze timing",
              value: `${visionMetrics.fixation}% / ${visionMetrics.latency}ms`,
              tone: "info",
              detail: "Fixation stability and saccadic latency window.",
            },
          ]}
        />
      </div>
    </div>
  );
}
