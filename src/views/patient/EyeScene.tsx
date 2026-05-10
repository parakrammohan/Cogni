import { motion } from "framer-motion";
import {
  Camera,
  Crosshair,
  Eye as EyeIcon,
  RotateCcw,
  Sparkles,
  StopCircle,
  Target,
} from "lucide-react";
import { useState } from "react";

import SmoothPursuitTest from "../../components/SmoothPursuitTest";
import { Button } from "../../components/ui/Button";
import { CalibrationStage } from "../../features/vision/CalibrationStage";
import {
  isCalibrationFresh,
  type CalibrationModel,
} from "../../features/vision/calibration";
import type { PursuitResult } from "../../features/vision/pursuit-analysis";
import type { VisionMetrics } from "../../features/vision/types";
import { cx } from "../../lib/utils";

type EyeMode = "monitor" | "calibrating" | "pursuit";

interface EyeSceneProps {
  visionMetrics: VisionMetrics;
  cameraStatus: string;
  isBlinking: boolean;
  calibration: CalibrationModel | null;
  onCalibrationComplete: (model: CalibrationModel) => void;
  onEnableCamera: () => void;
  onPursuitComplete: (result: PursuitResult) => void;
  implicitSampleCount: number;
  onRefineCalibration: () => void;
  attachStreamTo: (video: HTMLVideoElement | null) => () => void;
}

/**
 * Patient ocular surface. Two modes share the camera:
 *   - "monitor": continuous live blink rate, gaze stability, ocular risk.
 *   - "pursuit": 15-second smooth-pursuit test (with calibration if stale).
 *
 * Layout, top to bottom:
 *   1) Status row — three pill cards (Camera · Face lock · Calibration) so
 *      the patient can see what's working and what's not at a glance.
 *   2) Action card — the prominent "Start pursuit test" affordance with
 *      live-readiness state. Replaced by stop control during the test.
 *   3) Mode-specific content — calibration grid OR pursuit stage OR
 *      pursuit result hero, depending on `mode` and history.
 *   4) Camera-off / face-not-locked help (only when relevant).
 */
export function EyeScene({
  visionMetrics,
  cameraStatus,
  isBlinking,
  calibration,
  onCalibrationComplete,
  onEnableCamera,
  onPursuitComplete,
  implicitSampleCount,
  onRefineCalibration,
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
    setMode(calibrationOk ? "pursuit" : "calibrating");
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
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Eye check
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          {mode === "calibrating"
            ? "We need a quick gaze calibration before the test. Look at each dot in turn — keep your head still."
            : mode === "pursuit"
              ? "Follow the moving target with your eyes only. Keep your head still — the calibration we just took assumes your face stays where it was."
              : "Your live ocular biomarkers run continuously while the camera is on. Run a 15-second pursuit test for an oculomotor reading."}
        </p>
      </header>

      {/* Status row: three pill cards so patients can see what's working */}
      <StatusRow
        live={live}
        tracking={tracking}
        visionMetrics={visionMetrics}
        calibration={calibration}
        onEnableCamera={onEnableCamera}
        onRecalibrate={() => setMode("calibrating")}
        implicitSampleCount={implicitSampleCount}
        onRefineCalibration={onRefineCalibration}
      />

      {/* Primary action card */}
      {live ? (
        <ActionCard
          mode={mode}
          tracking={tracking}
          calibrationOk={calibrationOk}
          onStart={beginPursuit}
          onStop={() => setMode("monitor")}
        />
      ) : null}

      {/* Mode-specific content */}
      {mode === "calibrating" ? (
        <CalibrationStage
          gazeFeatures={visionMetrics.gazeFeatures}
          isBlinking={isBlinking}
          onComplete={handleCalibrationComplete}
          onCancel={() => setMode("monitor")}
          attachStreamTo={attachStreamTo}
        />
      ) : null}

      {mode === "pursuit" ? (
        <SmoothPursuitTest
          gazeFeatures={visionMetrics.gazeFeatures}
          irisPosition={visionMetrics.irisPosition}
          isBlinking={isBlinking}
          calibration={calibration}
          onTestComplete={handleTestComplete}
          testDuration={15}
          attachStreamTo={attachStreamTo}
        />
      ) : null}

      {mode === "monitor" && lastResult ? (
        <PursuitResultBanner result={lastResult} onRunAgain={beginPursuit} canRun={tracking} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Status row

function StatusRow({
  live,
  tracking,
  visionMetrics,
  calibration,
  onEnableCamera,
  onRecalibrate,
  implicitSampleCount,
  onRefineCalibration,
}: {
  live: boolean;
  tracking: boolean;
  visionMetrics: VisionMetrics;
  calibration: CalibrationModel | null;
  onEnableCamera: () => void;
  onRecalibrate: () => void;
  implicitSampleCount: number;
  onRefineCalibration: () => void;
}) {
  const calibrationOk = isCalibrationFresh(calibration);
  const calibrationQuality = calibration
    ? calibration.rmsResidual < 8
      ? "Sharp"
      : calibration.rmsResidual < 14
        ? "Acceptable"
        : "Loose"
    : null;
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <StatusCard
        icon={<Camera size={16} />}
        label="Camera"
        tone={live ? "good" : "calm"}
        title={live ? "Live" : "Off"}
        subtitle={
          live
            ? "Streaming face mesh"
            : "Camera not yet enabled — eye check needs it"
        }
        action={!live ? { label: "Enable", onClick: onEnableCamera } : undefined}
      />
      <StatusCard
        icon={<EyeIcon size={16} />}
        label="Face lock"
        tone={tracking ? "good" : live ? "warning" : "calm"}
        title={tracking ? "Locked" : live ? "Aligning" : "—"}
        subtitle={
          tracking
            ? `${visionMetrics.landmarkCount} landmarks · ${visionMetrics.blinkRate.toFixed(0)} blinks/min`
            : live
              ? "Looking for a face — center yourself in the camera"
              : "Enable the camera first"
        }
      />
      <StatusCard
        icon={<Crosshair size={16} />}
        label="Calibration"
        tone={calibrationOk ? "good" : tracking ? "warning" : "calm"}
        title={
          calibrationOk
            ? `${calibrationQuality} · ±${calibration!.rmsResidual.toFixed(1)}%`
            : "Not calibrated"
        }
        subtitle={
          calibrationOk
            ? formatCalibrationAge(calibration!.capturedAt) +
              (implicitSampleCount >= 12
                ? ` · ${implicitSampleCount} taps available to refine`
                : "")
            : "Pursuit test will calibrate before starting"
        }
        action={
          calibrationOk
            ? implicitSampleCount >= 12
              ? { label: "Refine", onClick: onRefineCalibration, dataAttr: { "data-skip-implicit-calibration": "" } }
              : { label: "Recalibrate", onClick: onRecalibrate }
            : undefined
        }
      />
    </section>
  );
}

function StatusCard({
  icon,
  label,
  title,
  subtitle,
  tone,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle: string;
  tone: "good" | "warning" | "calm";
  action?: { label: string; onClick: () => void; dataAttr?: Record<string, string> };
}) {
  const dot =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "warning"
        ? "bg-amber-500"
        : "bg-slate-300";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        <span className={cx("ml-auto h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      </div>
      <div className="mt-2 font-display text-lg font-semibold text-slate-900 sm:text-xl">
        {title}
      </div>
      <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          {...(action.dataAttr ?? {})}
          className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function formatCalibrationAge(capturedAt: number): string {
  const minutes = Math.round((Date.now() - capturedAt) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

// --------------------------------------------------------------- Action card

function ActionCard({
  mode,
  tracking,
  calibrationOk,
  onStart,
  onStop,
}: {
  mode: EyeMode;
  tracking: boolean;
  calibrationOk: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (mode === "calibrating") return null; // Calibration UI takes over below
  if (mode === "pursuit") {
    return (
      <div className="flex flex-col gap-3 rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
          <Target size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold text-slate-900">
            Pursuit test in progress
          </div>
          <p className="mt-0.5 text-sm text-slate-700">
            Stay focused on the moving target. Stop only if you need a break.
          </p>
        </div>
        <Button variant="secondary" icon={<StopCircle size={16} />} onClick={onStop}>
          Stop test
        </Button>
      </div>
    );
  }

  // Monitor mode
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cx(
        "group relative overflow-hidden rounded-3xl border p-5 shadow-(--shadow-soft) transition sm:p-6",
        tracking
          ? "border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white"
          : "border-slate-200 bg-slate-50",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <span
          className={cx(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-md",
            tracking
              ? "bg-gradient-to-br from-cyan-400 to-sky-500 text-white"
              : "bg-white text-slate-400",
          )}
        >
          <Target size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
            Pursuit test
          </div>
          <div className="mt-1 font-display text-xl font-semibold text-slate-900 sm:text-2xl">
            {tracking
              ? calibrationOk
                ? "Ready when you are."
                : "We'll calibrate first."
              : "Lock your face to begin."}
          </div>
          <p className="mt-1 max-w-xl text-sm text-slate-700">
            15-second smooth pursuit. We measure gain, accuracy, saccade rate, and latency —
            standard oculomotor research metrics.
          </p>
        </div>
        <Button onClick={onStart} disabled={!tracking} icon={<Target size={16} />}>
          {calibrationOk ? "Start" : "Calibrate & start"}
        </Button>
      </div>
    </motion.div>
  );
}

// ----------------------------------------------------------- Result hero card

function PursuitResultBanner({
  result,
  onRunAgain,
  canRun,
}: {
  result: PursuitResult;
  onRunAgain: () => void;
  canRun: boolean;
}) {
  const tone = toneFor(result);
  return (
    <section className={cx("overflow-hidden rounded-3xl border shadow-(--shadow-soft)", tone.surface)}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-6">
        <span
          className={cx(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-md",
            tone.iconWrap,
          )}
        >
          <Sparkles size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            Latest pursuit result
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-3xl font-semibold sm:text-4xl">
              {result.risk} risk
            </span>
            <span className="text-xs uppercase tracking-wider opacity-70">
              Heuristic — not clinical
            </span>
          </div>
          <p className="mt-1 max-w-md text-sm opacity-90">
            Smoothed gaze tracked through the camera drawer. Open it for the full live readout.
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
      <div className="grid grid-cols-2 gap-2 border-t border-current/10 bg-white/30 p-3 sm:grid-cols-4 sm:p-4">
        <ResultStat label="Gain" value={result.gain.toFixed(2)} hint="Ideal ≈ 1.00" />
        <ResultStat label="Accuracy" value={`${Math.round(result.accuracy)}%`} hint="Path adherence" />
        <ResultStat
          label="Saccades/s"
          value={result.saccadeRate.toFixed(2)}
          hint="Velocity spikes"
        />
        <ResultStat
          label="Latency"
          value={`${Math.round(result.latency)}ms`}
          hint="Phase shift"
        />
      </div>
    </section>
  );
}

interface ResultTone {
  surface: string;
  iconWrap: string;
}

function toneFor(result: PursuitResult): ResultTone {
  if (result.risk === "High") {
    return {
      surface: "border-red-200 bg-red-50 text-red-900",
      iconWrap: "bg-red-100 text-red-700",
    };
  }
  if (result.risk === "Moderate") {
    return {
      surface: "border-amber-200 bg-amber-50 text-amber-900",
      iconWrap: "bg-amber-100 text-amber-700",
    };
  }
  return {
    surface: "border-emerald-200 bg-emerald-50 text-emerald-900",
    iconWrap: "bg-emerald-100 text-emerald-700",
  };
}

function ResultStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-white/70 p-2 text-slate-900 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] opacity-60">{hint}</div>
    </div>
  );
}
