import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Eye as EyeIcon,
  RotateCcw,
  Sparkles,
  StopCircle,
  Target,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { CalibrationOverlay } from "../../features/vision/CalibrationStage";
import { HeadPoseWidget } from "../../features/vision/HeadPoseWidget";
import SmoothPursuitTest from "../../components/SmoothPursuitTest";
import type { NormalizedLandmark } from "../../features/vision/ear";
import type { Connection } from "../../features/vision/overlay";
import {
  isCalibrationFresh,
  type CalibrationModel,
} from "../../features/vision/calibration";
import type { PursuitResult } from "../../features/vision/pursuit-analysis";
import type { VisionMetrics } from "../../features/vision/types";
import { cx } from "../../lib/utils";
import type { SensorState } from "../../types/app";

type EyeMode = "monitor" | "calibrating" | "pursuit";

interface EyeSceneProps {
  visionMetrics: VisionMetrics;
  cameraStatus: SensorState;
  isBlinking: boolean;
  calibration: CalibrationModel | null;
  onCalibrationComplete: (model: CalibrationModel) => void;
  onEnableCamera: () => void;
  onPursuitComplete: (result: PursuitResult) => void;
  implicitSampleCount: number;
  onRefineCalibration: () => void;
  /** Attach the live camera stream to an element. From useVision. */
  attachStreamTo: (video: HTMLVideoElement | null) => () => void;
  /** Primary canvas where useVision draws the face mesh. We mirror its
   *  contents into a visible hero canvas so the eye outlines + iris
   *  markers show up on the patient's camera view. */
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Most recent landmarks — read by the head-pose widget for its mini
   *  mesh. */
  latestLandmarksRef: RefObject<NormalizedLandmark[] | null>;
  /** Lazy getter for the mesh tessellation (loaded with MediaPipe). */
  getMeshTessellation: () => readonly Connection[] | undefined;
}

/**
 * Camera-first Eye Check stage.
 *
 * Layout philosophy: the camera fills the available space and every UI
 * element is a floating "widget" overlaid on it — like a phone-camera
 * viewfinder with HUD. No scrolling, no card stacking. Mode-specific
 * content (calibration dots, pursuit target, result panel) overlays in
 * the same percentage coordinate space so everything stays aligned.
 *
 * The video element rendered here is a *secondary* attachment of the
 * shared camera stream via `attachStreamTo`. The primary video managed
 * by useVision stays mounted elsewhere so the face mesh keeps running.
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
  sourceCanvasRef,
  latestLandmarksRef,
  getMeshTessellation,
}: EyeSceneProps) {
  const [mode, setMode] = useState<EyeMode>("monitor");
  const [lastResult, setLastResult] = useState<PursuitResult | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const heroCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const live = cameraStatus === "live";
  const tracking = visionMetrics.faceDetected;
  const calibrationOk = isCalibrationFresh(calibration);
  const distance = visionMetrics.faceDistance;

  // Re-attach the shared stream every time the hero video element mounts
  // (i.e. when this scene becomes visible) or the camera turns on.
  useEffect(() => {
    if (!live) return undefined;
    return attachStreamTo(heroVideoRef.current);
  }, [attachStreamTo, live]);

  // Mirror the off-screen face-mesh canvas (where useVision actually draws)
  // onto the hero canvas overlay. drawImage is cheap; per-frame RAF copy.
  useEffect(() => {
    if (!live) return undefined;
    let raf = 0;
    const copy = () => {
      const src = sourceCanvasRef.current;
      const dst = heroCanvasRef.current;
      if (src && dst && src.width > 0 && src.height > 0) {
        if (dst.width !== src.width || dst.height !== src.height) {
          dst.width = src.width;
          dst.height = src.height;
        }
        const ctx = dst.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, dst.width, dst.height);
          ctx.drawImage(src, 0, 0);
        }
      }
      raf = requestAnimationFrame(copy);
    };
    raf = requestAnimationFrame(copy);
    return () => cancelAnimationFrame(raf);
  }, [live, sourceCanvasRef]);

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
    <div className="flex h-full flex-col">
      {/* The stage auto-fills whatever vertical space the AppShell hands
          us. flex-1 + min-h-0 lets it size to the actual viewport on any
          device — no hardcoded dvh subtractions. */}
      <div
        className={cx(
          "relative w-full min-h-0 flex-1 overflow-hidden rounded-3xl border shadow-(--shadow-soft)",
          live ? "border-slate-900 bg-black" : "border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white",
        )}
      >
        {/* Camera background. `pointer-events-none` when the camera isn't
            live, otherwise the invisible video element still sits on top of
            the Camera-off card and swallows every click — most notably the
            Enable camera button. */}
        <video
          ref={heroVideoRef}
          autoPlay
          playsInline
          muted
          aria-label="Live camera feed"
          className={cx(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            // Mirror so it feels like a mirror to the patient.
            "scale-x-[-1]",
            live
              ? "opacity-100"
              : "pointer-events-none opacity-0",
          )}
        />

        {/* Face mesh overlay. The source canvas already has the mesh
            drawn with a horizontal flip baked in (drawFaceMesh `mirror:
            true`), and the video uses its own CSS scale-x flip. We do
            NOT flip the canvas again here — that would double-flip and
            put the mesh on the opposite side of the face. */}
        {live ? (
          <canvas
            ref={heroCanvasRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {/* Subtle vignette so floating widgets are legible against any background */}
        {live ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/35"
          />
        ) : null}

        {/* Empty-state widget when camera is off — single CTA centered in the stage */}
        {!live ? <CameraOffCard onEnable={onEnableCamera} /> : null}

        {/* Mode-specific overlays (above camera, below status widgets) */}
        {live && mode === "calibrating" ? (
          <CalibrationOverlay
            gazeFeatures={visionMetrics.gazeFeatures}
            isBlinking={isBlinking}
            onComplete={handleCalibrationComplete}
            onCancel={() => setMode("monitor")}
          />
        ) : null}

        {live && mode === "pursuit" ? (
          <SmoothPursuitTest
            gazeFeatures={visionMetrics.gazeFeatures}
            irisPosition={visionMetrics.irisPosition}
            isBlinking={isBlinking}
            calibration={calibration}
            onTestComplete={handleTestComplete}
            onCancel={() => setMode("monitor")}
            overlay
          />
        ) : null}

        {/* Status widgets — top-left. Hidden during calibration so they
            don't cover the top-row dots. */}
        {live && mode !== "calibrating" ? (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
            <StatusWidget
              tone={tracking ? "good" : "warning"}
              icon={<EyeIcon size={13} />}
              label="Face lock"
              value={tracking ? "Locked" : "Aligning"}
              detail={
                tracking
                  ? `${visionMetrics.landmarkCount} pts`
                  : "Center yourself"
              }
            />
            <StatusWidget
              tone={calibrationOk ? "good" : tracking ? "warning" : "calm"}
              icon={<Target size={13} />}
              label="Calibration"
              value={
                calibrationOk
                  ? `±${calibration!.rmsResidual.toFixed(1)}%`
                  : "None"
              }
              detail={calibrationOk ? formatCalibrationAge(calibration!.capturedAt) : "Will run before test"}
              action={
                calibrationOk
                  ? implicitSampleCount >= 12
                    ? {
                        label: "Refine",
                        onClick: onRefineCalibration,
                        dataAttr: { "data-skip-implicit-calibration": "" },
                      }
                    : { label: "Recalibrate", onClick: () => setMode("calibrating") }
                  : undefined
              }
            />
          </div>
        ) : null}

        {/* Metrics widget — top-right (only in monitor mode so the
            calibration top-right dot is unobstructed). */}
        {live && tracking && mode === "monitor" ? (
          <div className="pointer-events-none absolute right-3 top-3">
            <MetricsWidget metrics={visionMetrics} />
          </div>
        ) : null}

        {/* Head-pose widget — only shows in monitor mode. Hidden during
            calibration so it doesn't cover the bottom-row dots, AND hidden
            during the pursuit test so it can't overlap the moving target
            or the action bar. Positioned just above where the action bar
            would sit. */}
        {live && mode === "monitor" ? (
          <div className="pointer-events-none absolute bottom-20 right-3 z-10">
            <HeadPoseWidget
              features={visionMetrics.gazeFeatures}
              landmarksRef={latestLandmarksRef}
              getTessellation={getMeshTessellation}
            />
          </div>
        ) : null}

        {/* Distance hint — center-top, only when something to fix */}
        {live && tracking && distance && distance !== "good" && mode === "monitor" ? (
          <DistanceHint distance={distance} />
        ) : null}

        {/* Action bar — bottom of stage */}
        {live && mode === "monitor" ? (
          <ActionBar
            tracking={tracking}
            calibrationOk={calibrationOk}
            distance={distance}
            onStart={beginPursuit}
          />
        ) : null}

        {/* Result toast — bottom of stage when a test just completed */}
        <AnimatePresence>
          {mode === "monitor" && lastResult ? (
            <ResultToast
              result={lastResult}
              onDismiss={() => setLastResult(null)}
              onRunAgain={beginPursuit}
              canRun={tracking}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- StatusWidget

function StatusWidget({
  icon,
  label,
  value,
  detail,
  tone,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone: "good" | "warning" | "calm";
  action?: { label: string; onClick: () => void; dataAttr?: Record<string, string> };
}) {
  const dot =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "warning"
        ? "bg-amber-400"
        : "bg-slate-300";
  return (
    <div className="pointer-events-auto inline-flex max-w-[14rem] items-start gap-2 rounded-2xl bg-black/55 px-3 py-2 text-white shadow-md backdrop-blur-md">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/90">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">
          <span className={cx("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
          {label}
        </div>
        <div className="mt-0.5 text-sm font-semibold leading-4 tabular-nums">{value}</div>
        {detail ? (
          <div className="mt-0.5 text-[10px] leading-3 opacity-70">{detail}</div>
        ) : null}
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            {...(action.dataAttr ?? {})}
            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide hover:bg-white/25"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- MetricsWidget

function MetricsWidget({ metrics }: { metrics: VisionMetrics }) {
  const riskAccent =
    metrics.risk === "High"
      ? "text-red-300"
      : metrics.risk === "Moderate"
        ? "text-amber-300"
        : "text-emerald-300";
  return (
    <div className="pointer-events-auto inline-flex gap-3 rounded-2xl bg-black/55 px-3 py-2 text-white shadow-md backdrop-blur-md">
      <Mini label="EAR" value={metrics.ear.toFixed(2)} />
      <Mini label="Blinks/min" value={metrics.blinkRate.toFixed(0)} />
      <Mini label="Risk" value={metrics.risk} accent={riskAccent} />
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0 text-right last:border-0">
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className={cx("mt-0.5 text-sm font-semibold tabular-nums", accent)}>{value}</div>
    </div>
  );
}

// ----------------------------------------------------------------- DistanceHint

function DistanceHint({ distance }: { distance: "too-far" | "too-close" }) {
  const copy =
    distance === "too-far"
      ? { title: "Move closer", body: "Your face is small in the frame — slide closer for a better fit." }
      : { title: "Move back a bit", body: "You're a little close — pull back so we can see your whole face." };
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-amber-500/95 px-4 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-md"
    >
      <span className="inline-flex items-center gap-1.5">
        <AlertTriangle size={12} />
        {copy.title}
        <span className="hidden font-normal opacity-90 sm:inline">— {copy.body}</span>
      </span>
    </motion.div>
  );
}

// ----------------------------------------------------------------- ActionBar

function ActionBar({
  tracking,
  calibrationOk,
  distance,
  onStart,
}: {
  tracking: boolean;
  calibrationOk: boolean;
  distance: VisionMetrics["faceDistance"];
  onStart: () => void;
}) {
  const ready = tracking && distance !== "too-far" && distance !== "too-close";
  return (
    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-black/55 px-3 py-2.5 text-white shadow-md backdrop-blur-md">
      <div className="text-xs leading-4">
        <div className="font-semibold">Smooth pursuit test</div>
        <div className="opacity-70">
          {!tracking
            ? "Waiting for face lock"
            : !calibrationOk
              ? "Will calibrate before starting (~22 s)"
              : "Calibrated and ready"}
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={!ready}
        className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-400 disabled:opacity-50"
      >
        <Sparkles size={14} />
        {calibrationOk ? "Start test" : "Calibrate & start"}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ----------------------------------------------------------------- CameraOffCard

function CameraOffCard({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-cyan-700 shadow-sm">
        <Camera size={26} aria-hidden />
      </span>
      <div>
        <h3 className="font-display text-xl font-semibold text-slate-900">Camera off</h3>
        <p className="mt-1 max-w-md text-sm leading-6 text-slate-700">
          Enable the camera to start the live face-mesh tracking and ocular biomarker readout.
        </p>
      </div>
      <button
        type="button"
        onClick={onEnable}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        <Camera size={16} />
        Enable camera
      </button>
    </div>
  );
}

// ----------------------------------------------------------------- ResultToast

function ResultToast({
  result,
  onDismiss,
  onRunAgain,
  canRun,
}: {
  result: PursuitResult;
  onDismiss: () => void;
  onRunAgain: () => void;
  canRun: boolean;
}) {
  const tone =
    result.risk === "High"
      ? { bg: "bg-red-500/90", icon: <AlertTriangle size={14} /> }
      : result.risk === "Moderate"
        ? { bg: "bg-amber-500/90", icon: <AlertTriangle size={14} /> }
        : { bg: "bg-emerald-500/90", icon: <CheckCircle2 size={14} /> };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cx(
        "absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-white shadow-md backdrop-blur-md",
        tone.bg,
      )}
    >
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          {tone.icon}
          {result.risk} risk pursuit result
        </div>
        <div className="mt-0.5 text-xs opacity-90">
          Gain {result.gain.toFixed(2)} · Accuracy {Math.round(result.accuracy)}% · {result.saccadeRate.toFixed(1)} sacc/s · {Math.round(result.latency)} ms
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRunAgain}
          disabled={!canRun}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/30 disabled:opacity-50"
        >
          <RotateCcw size={12} /> Run again
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss result"
          className="inline-flex items-center justify-center rounded-full bg-white/15 p-1.5 text-white transition hover:bg-white/25"
        >
          <StopCircle size={14} />
        </button>
      </div>
    </motion.div>
  );
}

function formatCalibrationAge(capturedAt: number): string {
  const minutes = Math.round((Date.now() - capturedAt) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

// Avoid lint-unused on imports we still expose for narrowing types
void ArrowLeft;
