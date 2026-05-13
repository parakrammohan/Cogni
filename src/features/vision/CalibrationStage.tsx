import { motion } from "framer-motion";
import { Crosshair, Target as TargetIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import {
  computeCalibration,
  type CalibrationModel,
  type CalibrationSample,
  type GazeFeatures,
} from "./calibration";

interface CalibrationOverlayProps {
  /** Head-pose-cancelled gaze features. Null when no live face lock. */
  gazeFeatures: GazeFeatures | null;
  isBlinking: boolean;
  onComplete: (model: CalibrationModel) => void;
  onCancel: () => void;
}

const DOT_GRID: Array<{ x: number; y: number }> = [
  { x: 8,  y: 10 }, { x: 50, y: 10 }, { x: 92, y: 10 },
  { x: 8,  y: 50 }, { x: 50, y: 50 }, { x: 92, y: 50 },
  { x: 8,  y: 90 }, { x: 50, y: 90 }, { x: 92, y: 90 },
];

const DWELL_MS = 2500;
const SETTLE_MS = 600;

/**
 * 9-point calibration as a pure overlay. Renders absolute-positioned dots
 * inside whatever parent container provides the positioning context (i.e.
 * the EyeScene camera stage). No viewport, no PIP camera — the camera is
 * already visible behind it.
 *
 * Each dot dwells 2.5s with a 600ms saccade-settle skip. After all dots
 * we run linear regression and report the model upward.
 */
export function CalibrationOverlay({
  gazeFeatures,
  isBlinking,
  onComplete,
  onCancel,
}: CalibrationOverlayProps) {
  const [phase, setPhase] = useState<"intro" | "running" | "computing">("intro");
  const [dotIndex, setDotIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const samplesRef = useRef<CalibrationSample[]>([]);
  const phaseTimerRef = useRef<number | null>(null);
  const dotEnteredAtRef = useRef(0);

  // Cleanup any pending timer.
  useEffect(
    () => () => {
      if (phaseTimerRef.current !== null) clearInterval(phaseTimerRef.current);
    },
    [],
  );

  // Driver: advance dotIndex on a 2.5s cadence, finalize after the last dot.
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

  // Sample gaze features during dwell windows (skip blinks + early settle).
  useEffect(() => {
    if (phase !== "running" || !gazeFeatures || isBlinking) return;
    const elapsed = performance.now() - dotEnteredAtRef.current;
    if (elapsed < SETTLE_MS) return;
    const target = DOT_GRID[dotIndex];
    if (!target) return;
    samplesRef.current.push({
      features: { ...gazeFeatures },
      screen: { x: target.x, y: target.y },
    });
  }, [gazeFeatures, isBlinking, phase, dotIndex]);

  function finalize() {
    setPhase("computing");
    window.setTimeout(() => {
      const model = computeCalibration(samplesRef.current);
      if (!model) {
        setPhase("intro");
        return;
      }
      onComplete(model);
    }, 50);
  }

  const target = DOT_GRID[dotIndex] ?? DOT_GRID[0]!;
  const dotsCompleted = dotIndex + (progress >= 1 ? 1 : 0);

  return (
    <>
      {/* Intro modal */}
      {phase === "intro" ? (
        <Overlay>
          <div className="text-center text-white">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-md">
              <Crosshair size={20} aria-hidden />
            </span>
            <h3 className="mt-3 text-lg font-semibold">Calibrate first</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-white/80">
              9 dots, ~22 seconds total. Look directly at each one with your eyes only —
              keep your head still.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={() => setPhase("running")} icon={<TargetIcon size={14} />}>
                Start calibration
              </Button>
              <Button variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        </Overlay>
      ) : null}

      {/* Active dot */}
      {phase === "running" ? (
        <>
          <motion.div
            key={dotIndex}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
            className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${target.x}%`, top: `${target.y}%` }}
            aria-hidden
          >
            <span className="absolute inset-0 rounded-full border-4 border-cyan-300 bg-cyan-400/30 shadow-[0_0_24px_rgba(34,211,238,0.6)]" />
            <span className="absolute inset-0 animate-ping rounded-full border-2 border-cyan-300 opacity-60" />
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200" />
            <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
              <circle
                cx="24"
                cy="24"
                r="22"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 22}`}
                strokeDashoffset={`${2 * Math.PI * 22 * (1 - progress)}`}
              />
            </svg>
          </motion.div>

          {/* Counter widget */}
          <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-2xl bg-black/55 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-md">
            Dot {dotIndex + 1} / {DOT_GRID.length}
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel calibration"
              className="ml-1 inline-flex items-center justify-center rounded-full bg-white/15 p-1 text-white transition hover:bg-white/25"
            >
              <X size={10} />
            </button>
          </div>

          {/* Bottom progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
            <div
              className="h-full bg-cyan-400 transition-[width] duration-75 ease-linear"
              style={{ width: `${(dotsCompleted / DOT_GRID.length) * 100}%` }}
            />
          </div>
        </>
      ) : null}

      {/* Computing modal */}
      {phase === "computing" ? (
        <Overlay>
          <div className="text-center text-white">
            <span className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-2xl border-4 border-white/30 border-t-cyan-300" />
            <p className="mt-3 text-sm">Fitting your gaze model…</p>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      {children}
    </div>
  );
}

// Keep the old export name working for any other importer (defensive)
export const CalibrationStage = CalibrationOverlay;
