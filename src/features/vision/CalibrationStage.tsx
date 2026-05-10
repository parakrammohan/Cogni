import { motion } from "framer-motion";
import { Crosshair, Target as TargetIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { cx } from "../../lib/utils";
import {
  computeCalibration,
  type CalibrationModel,
  type CalibrationSample,
  type IrisPoint,
} from "./calibration";

interface CalibrationStageProps {
  irisPosition: IrisPoint | null;
  isBlinking: boolean;
  onComplete: (model: CalibrationModel) => void;
  onCancel: () => void;
  attachStreamTo?: (video: HTMLVideoElement | null) => () => void;
}

const DOT_GRID: Array<{ x: number; y: number }> = [
  { x: 12, y: 14 }, { x: 50, y: 14 }, { x: 88, y: 14 },
  { x: 12, y: 50 }, { x: 50, y: 50 }, { x: 88, y: 50 },
  { x: 12, y: 86 }, { x: 50, y: 86 }, { x: 88, y: 86 },
];

const DWELL_MS = 1500;
const SETTLE_MS = 350;

/**
 * 9-point calibration. Each dot pulses for 1.5s. We discard the first 350ms
 * of saccadic motion and record iris positions during the remaining dwell.
 * After all dots, we run linear regression and report quality.
 */
export function CalibrationStage({
  irisPosition,
  isBlinking,
  onComplete,
  onCancel,
  attachStreamTo,
}: CalibrationStageProps) {
  const [phase, setPhase] = useState<"intro" | "running" | "computing">("intro");
  const [dotIndex, setDotIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const samplesRef = useRef<CalibrationSample[]>([]);
  const phaseTimerRef = useRef<number | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const dotEnteredAtRef = useRef(0);

  // Attach live stream to PIP preview so user knows tracking is running.
  useEffect(() => {
    if (!attachStreamTo) return undefined;
    return attachStreamTo(pipVideoRef.current);
  }, [attachStreamTo]);

  // Cleanup any pending timer.
  useEffect(
    () => () => {
      if (phaseTimerRef.current !== null) clearInterval(phaseTimerRef.current);
    },
    [],
  );

  // Driver: advance dotIndex on a 1.5s cadence, finalize after the last dot.
  useEffect(() => {
    if (phase !== "running") return;

    samplesRef.current = [];
    setDotIndex(0);
    dotEnteredAtRef.current = performance.now();

    const tick = () => {
      const elapsed = performance.now() - dotEnteredAtRef.current;
      setProgress(Math.min(1, elapsed / DWELL_MS));
      if (elapsed >= DWELL_MS) {
        setDotIndex((current) => {
          if (current + 1 >= DOT_GRID.length) {
            window.clearInterval(phaseTimerRef.current ?? 0);
            phaseTimerRef.current = null;
            finalize();
            return current;
          }
          dotEnteredAtRef.current = performance.now();
          setProgress(0);
          return current + 1;
        });
      }
    };

    phaseTimerRef.current = window.setInterval(tick, 33);
    return () => {
      if (phaseTimerRef.current !== null) {
        window.clearInterval(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }
    };
    // finalize is stable inside the closure; setDotIndex via fn-form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Sample iris position during dwell windows (skip blinks + early settle).
  useEffect(() => {
    if (phase !== "running" || !irisPosition || isBlinking) return;
    const elapsed = performance.now() - dotEnteredAtRef.current;
    if (elapsed < SETTLE_MS) return;
    const target = DOT_GRID[dotIndex];
    if (!target) return;
    samplesRef.current.push({
      iris: { x: irisPosition.x, y: irisPosition.y },
      screen: { x: target.x, y: target.y },
    });
  }, [irisPosition, isBlinking, phase, dotIndex]);

  function finalize() {
    setPhase("computing");
    // Defer to next frame so the UI updates before the regression solve.
    window.setTimeout(() => {
      const model = computeCalibration(samplesRef.current);
      if (!model) {
        // Not enough data — bounce back to intro.
        setPhase("intro");
        return;
      }
      onComplete(model);
    }, 50);
  }

  const target = DOT_GRID[dotIndex] ?? DOT_GRID[0]!;
  const dotsCompleted = dotIndex + (progress >= 1 ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-cyan-50/40 shadow-(--shadow-soft)">
        <GridBackdrop />

        {/* PIP camera preview */}
        {attachStreamTo ? (
          <div className="absolute right-3 top-3 z-10 overflow-hidden rounded-xl border border-white/30 bg-black/60 shadow-md backdrop-blur">
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

        {/* Phase content */}
        {phase === "intro" ? (
          <Overlay>
            <div className="text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <Crosshair size={20} aria-hidden />
              </span>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Calibrate first</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                We&apos;ll show 9 dots in turn. Look directly at each one and stay still — your
                head should not move. About 15 seconds total.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  onClick={() => setPhase("running")}
                  icon={<TargetIcon size={14} />}
                >
                  Start calibration
                </Button>
                <Button variant="secondary" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          </Overlay>
        ) : null}

        {phase === "running" ? (
          <>
            {/* Active dot */}
            <motion.div
              key={dotIndex}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 24 }}
              className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${target.x}%`, top: `${target.y}%` }}
              aria-hidden
            >
              <span className="absolute inset-0 rounded-full border-4 border-cyan-500 bg-cyan-500/25" />
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-cyan-500 opacity-60" />
              <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600" />
              {/* Dwell ring fills as time elapses */}
              <svg
                viewBox="0 0 48 48"
                className="absolute inset-0 -rotate-90"
                aria-hidden
              >
                <circle
                  cx="24"
                  cy="24"
                  r="22"
                  fill="none"
                  stroke="rgba(14, 116, 144, 0.18)"
                  strokeWidth="3"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="22"
                  fill="none"
                  stroke="#0e7490"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - progress)}`}
                />
              </svg>
            </motion.div>

            <div className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm">
              Dot {dotIndex + 1} / {DOT_GRID.length}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-200/70">
              <div
                className="h-full bg-cyan-500 transition-[width] duration-75 ease-linear"
                style={{
                  width: `${(dotsCompleted / DOT_GRID.length) * 100}%`,
                }}
              />
            </div>
          </>
        ) : null}

        {phase === "computing" ? (
          <Overlay>
            <div className="text-center">
              <span className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-2xl border-4 border-cyan-200 border-t-cyan-600" />
              <p className="mt-3 text-sm text-slate-700">Fitting your gaze model…</p>
            </div>
          </Overlay>
        ) : null}
      </div>

      {phase === "running" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-(--shadow-soft)">
          Tip: only your eyes should move. Keep your head perfectly still — the regression learns
          your face position once and won&apos;t handle big head moves later.
        </div>
      ) : null}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/85 backdrop-blur-sm">
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
