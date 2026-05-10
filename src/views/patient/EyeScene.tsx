import { Crosshair, RotateCcw, StopCircle, Target } from "lucide-react";
import { useState } from "react";

import SmoothPursuitTest from "../../components/SmoothPursuitTest";
import { Button } from "../../components/ui/Button";
import { CalibrationStage } from "../../features/vision/CalibrationStage";
import {
  isCalibrationFresh,
  type CalibrationModel,
} from "../../features/vision/calibration";
import { cx } from "../../lib/utils";
import type { PursuitResult } from "../../features/vision/pursuit-analysis";
import type { VisionMetrics } from "../../features/vision/types";

type EyeMode = "monitor" | "calibrating" | "pursuit";

interface EyeSceneProps {
  visionMetrics: VisionMetrics;
  cameraStatus: string;
  isBlinking: boolean;
  calibration: CalibrationModel | null;
  onCalibrationComplete: (model: CalibrationModel) => void;
  onEnableCamera: () => void;
  onPursuitComplete: (result: PursuitResult) => void;
  attachStreamTo: (video: HTMLVideoElement | null) => () => void;
}

export function EyeScene({
  visionMetrics,
  cameraStatus,
  isBlinking,
  calibration,
  onCalibrationComplete,
  onEnableCamera,
  onPursuitComplete,
  attachStreamTo,
}: EyeSceneProps) {
  const [mode, setMode] = useState<EyeMode>("monitor");
  const [lastResult, setLastResult] = useState<PursuitResult | null>(null);
  const live = cameraStatus === "live";
  const tracking = visionMetrics.irisPosition !== null;
  const calibrationOk = isCalibrationFresh(calibration);

  const beginPursuit = () => {
    if (!tracking) return;
    setLastResult(null);
    if (calibrationOk) {
      setMode("pursuit");
    } else {
      setMode("calibrating");
    }
  };

  const handleCalibrationComplete = (model: CalibrationModel) => {
    onCalibrationComplete(model);
    setMode("pursuit");
  };

  const handleTestComplete = (result: PursuitResult) => {
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
            {mode === "calibrating"
              ? "We need a quick calibration before the test. Look at each dot in turn."
              : mode === "pursuit"
                ? "Follow the moving target with your eyes only — keep your head still."
                : "Live blink rate, gaze stability, and ocular risk. Run a 15-second pursuit test for an oculomotor reading."}
          </p>
          {calibrationOk && mode === "monitor" ? (
            <CalibrationBadge calibration={calibration!} onRecalibrate={() => setMode("calibrating")} />
          ) : null}
        </div>

        {!live ? null : mode === "monitor" ? (
          <Button
            onClick={beginPursuit}
            disabled={!tracking}
            icon={<Target size={16} />}
            className="self-start"
          >
            {calibrationOk ? "Start pursuit test" : "Calibrate & start"}
          </Button>
        ) : mode === "pursuit" ? (
          <Button
            variant="secondary"
            onClick={() => setMode("monitor")}
            icon={<StopCircle size={16} />}
            className="self-start"
          >
            Stop test
          </Button>
        ) : null}
      </header>

      {mode === "calibrating" ? (
        <CalibrationStage
          irisPosition={visionMetrics.irisPosition}
          isBlinking={isBlinking}
          onComplete={handleCalibrationComplete}
          onCancel={() => setMode("monitor")}
          attachStreamTo={attachStreamTo}
        />
      ) : null}

      {mode === "pursuit" ? (
        <SmoothPursuitTest
          irisPosition={visionMetrics.irisPosition}
          isBlinking={isBlinking}
          calibration={calibration}
          onTestComplete={handleTestComplete}
          testDuration={15}
          attachStreamTo={attachStreamTo}
        />
      ) : null}

      {mode === "monitor" && lastResult ? (
        <PursuitResultBanner
          result={lastResult}
          onRunAgain={beginPursuit}
          canRun={tracking}
        />
      ) : null}

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

function CalibrationBadge({
  calibration,
  onRecalibrate,
}: {
  calibration: CalibrationModel;
  onRecalibrate: () => void;
}) {
  const ageMin = Math.round((Date.now() - calibration.capturedAt) / 60000);
  const quality =
    calibration.rmsResidual < 8
      ? "Sharp"
      : calibration.rmsResidual < 14
        ? "Acceptable"
        : "Loose";
  return (
    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
      <Crosshair size={12} className="text-cyan-700" aria-hidden />
      <span>
        Calibration: <strong className="text-slate-900">{quality}</strong> · ±
        {calibration.rmsResidual.toFixed(1)}% · {ageMin}m old
      </span>
      <button
        type="button"
        onClick={onRecalibrate}
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <RotateCcw size={10} aria-hidden /> Recalibrate
      </button>
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
            Heuristic score, not clinical. Full live readout is in the camera drawer above.
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
