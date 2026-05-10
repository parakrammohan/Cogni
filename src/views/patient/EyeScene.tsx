import { ChevronRight, RotateCcw, StopCircle, Target } from "lucide-react";
import { useState } from "react";

import SmoothPursuitTest from "../../components/SmoothPursuitTest";
import { Button } from "../../components/ui/Button";
import { cx } from "../../lib/utils";
import type { PursuitResult } from "../../features/vision/pursuit-analysis";
import type { VisionMetrics } from "../../features/vision/types";

type EyeMode = "monitor" | "pursuit";

interface EyeSceneProps {
  visionMetrics: VisionMetrics;
  cameraStatus: string;
  onEnableCamera: () => void;
  onPursuitComplete: (result: PursuitResult) => void;
  attachStreamTo: (video: HTMLVideoElement | null) => () => void;
}

/**
 * Unified ocular surface for the patient.
 *
 * Default mode is "monitor" — the CameraStage upstream of this component
 * shows the live face mesh and the in-camera ExpandableMetrics drawer
 * surfaces EAR / blink / fixation / latest pursuit result without scrolling.
 *
 * The patient can opt in to "pursuit" mode at any time (Start pursuit test
 * button). That replaces the camera with the pursuit stage, runs for 15s,
 * then drops back to monitor and the new result lands in the drawer.
 */
export function EyeScene({
  visionMetrics,
  cameraStatus,
  onEnableCamera,
  onPursuitComplete,
  attachStreamTo,
}: EyeSceneProps) {
  const [mode, setMode] = useState<EyeMode>("monitor");
  const [lastResult, setLastResult] = useState<PursuitResult | null>(null);
  const live = cameraStatus === "live";
  const tracking = visionMetrics.irisPosition !== null;

  const startPursuit = () => {
    if (!tracking) return;
    setLastResult(null);
    setMode("pursuit");
  };

  const stopPursuit = () => setMode("monitor");

  const handleComplete = (result: PursuitResult) => {
    setLastResult(result);
    onPursuitComplete(result);
    setMode("monitor");
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            Eye check
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
            {mode === "pursuit"
              ? "Follow the moving target with your eyes only — keep your head still."
              : "Live blink-rate, gaze stability, and ocular risk. Run a 15-second pursuit test for an oculomotor reading."}
          </p>
        </div>

        {/* Mode toggle */}
        {!live ? null : mode === "monitor" ? (
          <Button
            onClick={startPursuit}
            disabled={!tracking}
            icon={<Target size={16} />}
            className="self-start"
          >
            Start pursuit test
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={stopPursuit}
            icon={<StopCircle size={16} />}
            className="self-start"
          >
            Stop test
          </Button>
        )}
      </header>

      {/* Pursuit stage — only when running. Camera goes to PIP, target takes the canvas. */}
      {mode === "pursuit" ? (
        <SmoothPursuitTest
          irisPosition={visionMetrics.irisPosition}
          onTestComplete={handleComplete}
          testDuration={15}
          attachStreamTo={attachStreamTo}
        />
      ) : null}

      {/* Inline pursuit result (shows immediately after a test, persists until next test) */}
      {mode === "monitor" && lastResult ? (
        <PursuitResultBanner
          result={lastResult}
          onRunAgain={startPursuit}
          canRun={tracking}
        />
      ) : null}

      {/* Helper instructions when camera off */}
      {!live ? (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 text-sm text-slate-700">
          Enable the camera above to start live face-mesh tracking. Once a face is locked, you
          can also run a pursuit test from this scene.
          <div className="mt-3">
            <Button onClick={onEnableCamera}>Enable camera</Button>
          </div>
        </div>
      ) : !tracking && mode === "monitor" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Camera is on but no face is locked yet. Center your face in the camera, hold still
          for a moment, and the start button will activate.
        </div>
      ) : null}
    </div>
  );
}

function PursuitResultBanner({
  result,
  onRunAgain,
  canRun,
}: {
  result: PursuitResult;
  onRunAgain: () => void;
  canRun: boolean;
}) {
  const tone =
    result.risk === "High"
      ? "border-red-200 bg-red-50 text-red-900"
      : result.risk === "Moderate"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <section className={cx("rounded-2xl border p-4 sm:p-5", tone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            Latest pursuit result
          </div>
          <div className="mt-1 font-display text-2xl font-semibold">{result.risk} risk</div>
          <p className="mt-1 max-w-md text-xs opacity-80">
            Heuristic score, not clinical. The full breakdown is in the camera drawer above.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRunAgain}
          disabled={!canRun}
          icon={<RotateCcw size={14} />}
        >
          Run again
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ResultStat label="Gain" value={result.gain.toFixed(2)} />
        <ResultStat label="Accuracy" value={`${Math.round(result.accuracy)}%`} />
        <ResultStat label="Saccades/s" value={result.saccadeRate.toFixed(2)} />
        <ResultStat label="Latency" value={`${Math.round(result.latency)}ms`} />
      </div>
      <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold opacity-80">
        Open the camera drawer for the full live readout
        <ChevronRight size={12} aria-hidden />
      </div>
    </section>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/60 p-2 text-slate-900 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
