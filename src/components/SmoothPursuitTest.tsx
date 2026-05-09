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
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "./ui/Button";
import { cx } from "../lib/utils";
import {
  analyzePursuit,
  type PathPoint,
  type PursuitResult,
} from "../features/vision/pursuit-analysis";

interface SmoothPursuitTestProps {
  onTestComplete: (result: PursuitResult) => void;
  irisPosition: { x: number; y: number } | null;
  testDuration?: number;
}

const DEFAULT_DURATION_S = 15;
const TARGET_RADIUS_PCT = 35;
const TARGET_REVOLUTIONS = 2;

type Phase = "idle" | "countdown" | "running" | "complete";

export default function SmoothPursuitTest({
  onTestComplete,
  irisPosition,
  testDuration = DEFAULT_DURATION_S,
}: SmoothPursuitTestProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [progress, setProgress] = useState(0);
  const [target, setTarget] = useState({ x: 50, y: 50 });
  const [lastResult, setLastResult] = useState<PursuitResult | null>(null);

  const targetPathRef = useRef<PathPoint[]>([]);
  const gazePathRef = useRef<PathPoint[]>([]);
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

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

      const angle = ratio * TARGET_REVOLUTIONS * 2 * Math.PI - Math.PI / 2;
      const x = 50 + TARGET_RADIUS_PCT * Math.cos(angle);
      const y = 50 + TARGET_RADIUS_PCT * Math.sin(angle);
      setTarget({ x, y });
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

  // Record gaze samples
  useEffect(() => {
    if (phase !== "running" || !irisPosition) return;
    gazePathRef.current.push({
      x: irisPosition.x,
      y: irisPosition.y,
      time: Date.now(),
    });
  }, [irisPosition, phase]);

  function startTest() {
    if (!irisPosition) return;
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

  return (
    <div className="space-y-4">
      {/* Stage — matches CameraStage / OcularScene look */}
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-cyan-50/40 shadow-(--shadow-soft)">
        <GridBackdrop />

        {/* Center crosshair anchor */}
        <div className="absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2">
          <span
            className="absolute -translate-x-1/2 -translate-y-1/2 text-slate-300"
            aria-hidden
          >
            <Crosshair size={20} />
          </span>
        </div>

        {/* Target */}
        {phase === "running" ? (
          <div
            className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75 ease-linear"
            style={{ left: `${target.x}%`, top: `${target.y}%` }}
            aria-hidden
          >
            <span className="absolute inset-0 rounded-full border-4 border-cyan-500 bg-cyan-500/25" />
            <span className="absolute inset-0 animate-ping rounded-full border-2 border-cyan-500 opacity-60" />
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600" />
          </div>
        ) : null}

        {/* Live gaze marker (subtle) */}
        {phase === "running" && irisPosition ? (
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 bg-amber-300/60"
            style={{ left: `${irisPosition.x}%`, top: `${irisPosition.y}%` }}
            aria-hidden
          />
        ) : null}

        {/* Phase overlays */}
        {phase === "idle" ? (
          <Overlay>
            <div className="text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <Activity size={20} aria-hidden />
              </span>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Ready to begin</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">
                Follow the cyan target with your eyes only — keep your head still. The test runs
                for {testDuration} seconds.
              </p>
              <Button
                onClick={startTest}
                disabled={!irisPosition}
                icon={<Play size={14} />}
                className="mt-4"
              >
                Start test
              </Button>
              {!irisPosition ? (
                <p className="mt-2 text-xs text-amber-700">
                  Waiting for face lock — make sure the camera mesh is live.
                </p>
              ) : null}
            </div>
          </Overlay>
        ) : null}

        {phase === "countdown" ? (
          <Overlay>
            <div className="text-center">
              <div className="font-display text-7xl font-semibold text-slate-900 tabular-nums">
                {countdown}
              </div>
              <p className="mt-2 text-sm text-slate-600">Get ready…</p>
            </div>
          </Overlay>
        ) : null}

        {phase === "complete" ? (
          <Overlay>
            <div className="text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <TargetIcon size={20} aria-hidden />
              </span>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Test complete</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">
                Your results are below.
              </p>
              <Button
                variant="secondary"
                onClick={resetTest}
                icon={<RotateCcw size={14} />}
                className="mt-4"
              >
                Run again
              </Button>
            </div>
          </Overlay>
        ) : null}

        {/* Live readout strip */}
        {phase === "running" ? (
          <>
            <div className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur">
              {remaining}s
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-200/70">
              <div
                className="h-full bg-cyan-500 transition-[width] duration-75 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </>
        ) : null}
      </div>

      {/* Live legend */}
      {phase === "running" ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-(--shadow-soft)">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" aria-hidden />
            Target
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden />
            Your gaze
          </span>
          <span className="ml-auto">{Math.round(progress * 100)}% complete</span>
        </div>
      ) : null}

      {/* Results */}
      {phase === "complete" && lastResult ? <ResultsGrid result={lastResult} /> : null}
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
