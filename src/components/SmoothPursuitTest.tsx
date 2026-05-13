/**
 * Smooth Pursuit Eye Movement Test
 *
 * Scientific design notes:
 *   - Target follows a circular trajectory at a constant angular velocity.
 *     This produces a clean reference for computing pursuit gain.
 *   - We sample the iris position from the upstream MediaPipe face mesh.
 *     Sample rate is ~7 Hz (vision loop throttle), target sampled at RAF
 *     (~60 Hz). analyzePursuit() handles the rate mismatch.
 *
 * Metrics emitted (see features/vision/pursuit-analysis.ts):
 *   - gain        : eye / target velocity ratio (1.0 = perfect, <0.7 reduced)
 *   - accuracy    : 100 - mean position error (0..100 %)
 *   - saccadeRate : velocity-spike count per second
 *   - latency     : phase-shift between target and eye, in ms
 */

import { Activity, Crosshair, Play, RotateCcw, Target as TargetIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "./ui/Button";
import { cx } from "../lib/utils";
import {
  applyCalibration,
  GazeSmoother,
  type CalibrationModel,
  type GazeFeatures,
} from "../features/vision/calibration";
import {
  analyzePursuit,
  type PathPoint,
  type PursuitResult,
} from "../features/vision/pursuit-analysis";
import { useWebEyeTrack } from "../features/vision/useWebEyeTrack";

interface SmoothPursuitTestProps {
  onTestComplete: (result: PursuitResult) => void;
  /** Head-pose-stable gaze features from useVision. Preferred over irisPosition. */
  gazeFeatures: GazeFeatures | null;
  /** Raw iris position fallback (used if no calibration is set). */
  irisPosition: { x: number; y: number } | null;
  /** When the patient is mid-blink, gaze samples are dropped (Kalman predicts only). */
  isBlinking?: boolean;
  /** Optional calibration. When provided, gaze features map to screen coords
   *  via the fitted regression before being recorded — much higher gain
   *  accuracy. Without calibration, raw iris coords are used. */
  calibration?: CalibrationModel | null;
  testDuration?: number;
  /** When provided, mounts a small PIP video showing the live camera feed. */
  attachStreamTo?: (video: HTMLVideoElement | null) => () => void;
  /** Called when the user cancels mid-test or after a complete result. */
  onCancel?: () => void;
  /** When true the component renders as a pure overlay (no own viewport,
   *  no PIP camera) — the parent provides the positioning context. Used by
   *  the new camera-first Eye scene. */
  overlay?: boolean;
}

const DEFAULT_DURATION_S = 22;

/* Smooth Lissajous target.
 *
 *   x(t) = 50 + Ax · sin(2π t / Tx)
 *   y(t) = 50 + Ay · sin(2π t / Ty + π/2)
 *
 * Co-prime periods (5 s / 7 s) so the path doesn't close immediately and
 * the user visits every quadrant several times during a 22-second run.
 * Amplitudes set so the target visits 6–94 % on both axes — well into the
 * corner regions while leaving a small margin so it never clips the
 * stage edge.
 */
const TARGET_AMPLITUDE_PCT = 44;
const TARGET_PERIOD_X_S = 5;
const TARGET_PERIOD_Y_S = 7;

type Phase = "idle" | "countdown" | "running" | "complete";

export default function SmoothPursuitTest({
  onTestComplete,
  gazeFeatures,
  irisPosition,
  isBlinking = false,
  calibration = null,
  testDuration = DEFAULT_DURATION_S,
  attachStreamTo,
  onCancel,
  overlay = false,
}: SmoothPursuitTestProps) {
  // Kalman smoother is per-test-instance. Reset whenever a new test starts.
  const smoother = useMemo(() => new GazeSmoother(), []);
  const [phase, setPhase] = useState<Phase>("idle");
  // WebEyeTrack is the preferred gaze source — CNN-based, calibrated by
  // clicks-as-fixations, runs in its own worker. We load it lazily only
  // when this component mounts so the rest of the app stays light.
  const webEyeTrack = useWebEyeTrack({ enabled: true });
  const [countdown, setCountdown] = useState(0);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<PursuitResult | null>(null);

  const targetPathRef = useRef<PathPoint[]>([]);
  const gazePathRef = useRef<PathPoint[]>([]);
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  // Direct DOM ref for the target: we drive position via transform inside
  // the RAF callback to avoid (a) a per-frame React rerender and (b) the
  // CSS transition that used to chase top/left changes and produced visible
  // stutter / jumps. transform is GPU-composited, so motion stays smooth.
  const targetElRef = useRef<HTMLDivElement | null>(null);

  // Attach the parent's MediaStream to the PIP video element when mounted.
  useEffect(() => {
    if (!attachStreamTo) return undefined;
    return attachStreamTo(pipVideoRef.current);
  }, [attachStreamTo]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (countdownTimerRef.current !== null) clearInterval(countdownTimerRef.current);
    },
    [],
  );

  const finishTest = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPhase("complete");
    const result = analyzePursuit(
      targetPathRef.current,
      gazePathRef.current,
      testDuration * 1000,
    );
    setLastResult(result);
    onTestComplete(result);
  }, [onTestComplete, testDuration]);

  // Animate target while running
  useEffect(() => {
    if (phase !== "running") return undefined;

    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const now = Date.now();
      const elapsed = (now - startedAtRef.current) / 1000;
      const ratio = Math.min(elapsed / testDuration, 1);
      setProgress(ratio);

      const tx = (2 * Math.PI * elapsed) / TARGET_PERIOD_X_S;
      const ty = (2 * Math.PI * elapsed) / TARGET_PERIOD_Y_S + Math.PI / 2;
      const x = 50 + TARGET_AMPLITUDE_PCT * Math.sin(tx);
      const y = 50 + TARGET_AMPLITUDE_PCT * Math.sin(ty);
      // Drive the DOM directly — no React state, no CSS transition. The
      // CSS transition used to chase setState updates and produced visible
      // stutter (target appearing stuck near the centre with occasional
      // jumps). At 60 Hz on a single small element, direct style writes
      // are smooth.
      const el = targetElRef.current;
      if (el) {
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
      }
      targetPathRef.current.push({ x, y, time: now });

      if (ratio >= 1) {
        finishTest();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [phase, testDuration, finishTest]);

  // Record gaze samples. Sources preferred in order:
  //   1. WebEyeTrack — CNN-based, already screen-space, self-calibrating
  //   2. gazeFeatures + our linear-regression calibration
  //   3. raw irisPosition
  //   4. drop during blinks (Kalman extrapolates)
  useEffect(() => {
    if (phase !== "running") return;
    const webGaze = webEyeTrack.gaze;
    if (isBlinking || webGaze?.state === "closed") {
      smoother.push(null);
      return;
    }
    let measurement: { x: number; y: number } | null = null;
    if (webGaze) {
      measurement = { x: webGaze.x, y: webGaze.y };
    } else if (calibration && gazeFeatures) {
      measurement = applyCalibration(gazeFeatures, calibration);
    } else if (irisPosition) {
      measurement = irisPosition;
    }
    const smoothed = smoother.push(measurement);
    if (!smoothed) return;
    gazePathRef.current.push({
      x: smoothed.x,
      y: smoothed.y,
      time: Date.now(),
    });
  }, [gazeFeatures, irisPosition, isBlinking, phase, calibration, smoother, webEyeTrack.gaze]);

  // The test can run from any of three gaze sources:
  //   - WebEyeTrack (preferred; needs to be ready)
  //   - our regression-calibrated gazeFeatures
  //   - raw iris coordinates as a last fallback
  const canStart =
    webEyeTrack.status === "ready" ||
    (calibration && gazeFeatures !== null) ||
    irisPosition !== null;

  function startTest() {
    if (!canStart) return;
    smoother.reset();
    setPhase("countdown");
    setCountdown(3);
    setLastResult(null);
    targetPathRef.current = [];
    gazePathRef.current = [];

    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current !== null) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          startedAtRef.current = Date.now();
          setProgress(0);
          setPhase("running");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function resetTest() {
    setPhase("idle");
    setLastResult(null);
    setProgress(0);
  }

  const remaining = Math.max(0, Math.ceil(testDuration - progress * testDuration));

  // The inner content (target + overlays + gaze marker + progress bar) is
  // identical in both modes; only the outer wrapper differs.
  const inner = (
    <>
      {/* Target — position is driven directly via targetElRef in the RAF
          loop; no CSS transition, no React state per frame. */}
      {phase === "running" ? (
        <div
          ref={targetElRef}
          className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `50%`, top: `50%` }}
          aria-hidden
        >
          <span className="absolute inset-0 rounded-full border-4 border-cyan-400 bg-cyan-400/30 shadow-[0_0_24px_rgba(34,211,238,0.7)]" />
          <span className="absolute inset-0 animate-ping rounded-full border-2 border-cyan-300 opacity-60" />
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200" />
        </div>
      ) : null}

      {/* Live gaze marker (subtle amber dot showing where the system thinks
          the user is looking) */}
      {phase === "running" && irisPosition ? (
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 bg-amber-300/60"
          style={{ left: `${irisPosition.x}%`, top: `${irisPosition.y}%` }}
          aria-hidden
        />
      ) : null}

      {/* Pre-start prompt */}
      {phase === "idle" ? (
        <PhaseOverlay overlay={overlay}>
          <div className="text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-md">
              <Activity size={20} aria-hidden />
            </span>
            <h3 className="mt-3 text-lg font-semibold text-white">Ready to begin</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-white/80">
              Follow the cyan target with your eyes only — keep your head still.
              The test runs for {testDuration} seconds.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button
                onClick={startTest}
                disabled={!canStart}
                icon={<Play size={14} />}
              >
                Start test
              </Button>
              {onCancel ? (
                <Button variant="secondary" onClick={onCancel}>Cancel</Button>
              ) : null}
            </div>
            {!canStart ? (
              <p className="mt-2 text-xs text-amber-300">
                Waiting for face lock — make sure the camera mesh is live.
              </p>
            ) : null}
          </div>
        </PhaseOverlay>
      ) : null}

      {/* Countdown */}
      {phase === "countdown" ? (
        <PhaseOverlay overlay={overlay}>
          <div className="text-center">
            <div className="font-display text-7xl font-semibold text-white tabular-nums">
              {countdown}
            </div>
            <p className="mt-2 text-sm text-white/80">Get ready…</p>
          </div>
        </PhaseOverlay>
      ) : null}

      {/* Completion */}
      {phase === "complete" ? (
        <PhaseOverlay overlay={overlay}>
          <div className="text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 backdrop-blur-md">
              <TargetIcon size={20} aria-hidden />
            </span>
            <h3 className="mt-3 text-lg font-semibold text-white">Test complete</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-white/80">
              {overlay ? "Result is now in the bar at the bottom." : "Your results are below."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={resetTest} icon={<RotateCcw size={14} />}>
                Run again
              </Button>
              {onCancel ? <Button onClick={onCancel}>Done</Button> : null}
            </div>
          </div>
        </PhaseOverlay>
      ) : null}

      {/* Live readout — countdown + progress bar */}
      {phase === "running" ? (
        <>
          <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-2xl bg-black/55 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-md">
            {remaining}s left
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Stop test"
                className="ml-1 inline-flex items-center justify-center rounded-full bg-white/15 p-1 text-white transition hover:bg-white/25"
              >
                <RotateCcw size={10} />
              </button>
            ) : null}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
            <div
              className="h-full bg-cyan-400 transition-[width] duration-75 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </>
      ) : null}
    </>
  );

  // Overlay mode — render directly into the parent's positioning context.
  if (overlay) return inner;

  // Standalone mode — the legacy aspect-video stage + PIP camera.
  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-900 bg-black shadow-(--shadow-soft)">
        <GridBackdrop />

        {/* Picture-in-picture camera preview — confirms tracking is running */}
        {attachStreamTo ? (
          <div className="absolute right-3 top-3 z-10 overflow-hidden rounded-xl border border-white/30 bg-black/50 shadow-md backdrop-blur">
            <video
              ref={pipVideoRef}
              autoPlay
              playsInline
              muted
              aria-label="Live camera preview"
              className="h-20 w-28 object-cover"
            />
            <div className="flex items-center justify-center gap-1 bg-black/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Tracking
            </div>
          </div>
        ) : null}

        {/* Center crosshair anchor */}
        <div className="absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2">
          <span className="absolute -translate-x-1/2 -translate-y-1/2 text-white/40" aria-hidden>
            <Crosshair size={20} />
          </span>
        </div>

        {inner}
      </div>

      {/* Results */}
      {phase === "complete" && lastResult ? <ResultsGrid result={lastResult} /> : null}
    </div>
  );
}

/** Inline overlay used by both standalone and overlay-mode rendering. Dark
 *  tint over the camera feed in overlay mode so widgets stay legible. */
function PhaseOverlay({
  overlay,
  children,
}: {
  overlay: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center p-4 backdrop-blur-sm ${
        overlay ? "bg-black/55" : "bg-black/70"
      }`}
    >
      {children}
    </div>
  );
}

function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-50"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    />
  );
}

function ResultsGrid({ result }: { result: PursuitResult }) {
  const riskTone =
    result.risk === "High"
      ? "border-red-200 bg-red-50 text-red-800"
      : result.risk === "Moderate"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <section className="space-y-3">
      <div
        className={cx(
          "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
          riskTone,
        )}
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            Pursuit risk
          </div>
          <div className="text-base font-semibold">{result.risk}</div>
        </div>
        <div className="text-xs opacity-80">Heuristic score, not clinical</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Pursuit gain"
          value={result.gain.toFixed(2)}
          hint="Ideal ≈ 1.00"
          warn={result.gain < 0.7 || result.gain > 1.3}
        />
        <Stat
          label="Accuracy"
          value={`${Math.round(result.accuracy)}%`}
          hint="Path adherence"
          warn={result.accuracy < 60}
        />
        <Stat
          label="Saccade rate"
          value={`${result.saccadeRate.toFixed(2)}/s`}
          hint="Velocity spikes"
          warn={result.saccadeRate > 1.5}
        />
        <Stat
          label="Latency"
          value={`${Math.round(result.latency)}ms`}
          hint="Phase shift"
          warn={result.latency > 280}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border bg-white p-4 shadow-(--shadow-soft)",
        warn ? "border-amber-200" : "border-slate-200",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
