/**
 * Smooth Pursuit Eye Movement Test
 * Patient follows a moving target with their eyes; we score smoothness, latency,
 * accuracy and saccade count from real iris coordinates supplied by the vision pipeline.
 *
 * Refuses to run if `irisPosition` is null — that means the camera isn't producing
 * a live face lock and we'd be scoring against simulated jitter.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Camera, Target } from "lucide-react";

interface PursuitResult {
  smoothness: number;
  latency: number;
  accuracy: number;
  saccadeCount: number;
  risk: "Low" | "Moderate" | "High";
}

interface PathPoint {
  x: number;
  y: number;
  time: number;
}

interface SmoothPursuitTestProps {
  onTestComplete: (result: PursuitResult) => void;
  irisPosition: { x: number; y: number } | null;
  testDuration?: number;
}

const DEFAULT_DURATION_S = 15;
const SACCADE_THRESHOLD_PX = 15;
const FOLLOWING_DISTANCE_THRESHOLD = 20;
const SMOOTH_VELOCITY_THRESHOLD = 5;

export default function SmoothPursuitTest({
  onTestComplete,
  irisPosition,
  testDuration = DEFAULT_DURATION_S,
}: SmoothPursuitTestProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(testDuration);
  const [targetPosition, setTargetPosition] = useState({ x: 50, y: 50 });

  const startTimeRef = useRef(0);
  const targetPathRef = useRef<PathPoint[]>([]);
  const gazePathRef = useRef<PathPoint[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const liveTrackingAvailable = irisPosition !== null;

  const finishTest = useCallback(() => {
    setIsRunning(false);
    const targetPath = targetPathRef.current;
    const gazePath = gazePathRef.current;

    if (targetPath.length < 10 || gazePath.length < 10) {
      // Not enough samples — emit a zero-confidence result so the caller can show feedback.
      onTestComplete({
        smoothness: 0,
        latency: 0,
        accuracy: 0,
        saccadeCount: 0,
        risk: "Low",
      });
      return;
    }

    const smoothness = calculateSmoothness(gazePath);
    const latency = calculateLatency(targetPath, gazePath);
    const accuracy = calculateAccuracy(targetPath, gazePath);
    const saccadeCount = detectSaccades(gazePath);

    let riskScore = 0;
    if (smoothness < 70) riskScore += 2;
    else if (smoothness < 85) riskScore += 1;
    if (latency > 250) riskScore += 2;
    else if (latency > 180) riskScore += 1;
    if (saccadeCount > 10) riskScore += 2;
    else if (saccadeCount > 5) riskScore += 1;

    const risk: PursuitResult["risk"] = riskScore >= 4 ? "High" : riskScore >= 2 ? "Moderate" : "Low";

    onTestComplete({
      smoothness: Math.round(smoothness),
      latency: Math.round(latency),
      accuracy: Math.round(accuracy),
      saccadeCount,
      risk,
    });
  }, [onTestComplete]);

  const startTest = () => {
    if (!liveTrackingAvailable || isRunning || countdown > 0) return;
    setCountdown(3);
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current !== null) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setIsRunning(true);
          setTimeRemaining(testDuration);
          startTimeRef.current = Date.now();
          targetPathRef.current = [];
          gazePathRef.current = [];
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cleanup intervals + RAF on unmount
  useEffect(
    () => () => {
      if (countdownIntervalRef.current !== null) clearInterval(countdownIntervalRef.current);
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    },
    [],
  );

  // Animate target in a circular pattern
  useEffect(() => {
    if (!isRunning) return undefined;

    const startTime = Date.now();
    let active = true;

    function animate() {
      if (!active) return;
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = elapsed / testDuration;

      if (progress >= 1) {
        finishTest();
        return;
      }

      const angle = progress * 4 * Math.PI;
      const radius = 35;
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);

      setTargetPosition({ x, y });
      setTimeRemaining(Math.ceil(testDuration - elapsed));
      targetPathRef.current.push({ x, y, time: Date.now() });

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      active = false;
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isRunning, testDuration, finishTest]);

  // Record gaze samples
  useEffect(() => {
    if (!isRunning || !irisPosition) return;
    gazePathRef.current.push({
      x: irisPosition.x,
      y: irisPosition.y,
      time: Date.now(),
    });
  }, [irisPosition, isRunning]);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-slate-200 bg-white p-6">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2 text-blue-600">
              <Target size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Smooth Pursuit Test</h3>
              <p className="text-sm text-slate-600">Follow the moving target with your eyes</p>
            </div>
          </div>
          {liveTrackingAvailable && !isRunning && countdown === 0 ? (
            <button
              type="button"
              onClick={startTest}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Start Test
            </button>
          ) : null}
        </header>

        <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100">
          {!liveTrackingAvailable ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-slate-200 p-3 text-slate-500">
                <Camera size={28} />
              </div>
              <h4 className="text-base font-semibold text-slate-900">Camera tracking required</h4>
              <p className="max-w-xs text-sm text-slate-600">
                Enable the camera and align your face so a live mesh locks before starting this
                test.
              </p>
            </div>
          ) : null}

          {liveTrackingAvailable && countdown > 0 && !isRunning ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90">
              <div className="text-center">
                <div className="text-6xl font-bold text-slate-900">{countdown}</div>
                <p className="mt-2 text-sm text-slate-600">Get ready...</p>
              </div>
            </div>
          ) : null}

          {isRunning ? (
            <>
              <div
                className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-red-500 bg-red-500/20 transition-all duration-75"
                style={{ left: `${targetPosition.x}%`, top: `${targetPosition.y}%` }}
                aria-hidden
              >
                <div className="absolute inset-0 animate-ping rounded-full border-2 border-red-500 opacity-75" />
              </div>
              <div className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm">
                {timeRemaining}s
              </div>
            </>
          ) : null}

          {liveTrackingAvailable && !isRunning && countdown === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-md text-center">
                <Activity size={48} className="mx-auto mb-4 text-blue-600" />
                <h4 className="mb-2 text-lg font-semibold text-slate-900">Ready to begin</h4>
                <p className="text-sm text-slate-600">
                  A red target will move across the screen. Follow it smoothly with your eyes — keep
                  your head still. The test runs for {testDuration} seconds.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Hint title="Keep head still" body="Only move your eyes" />
          <Hint title="Follow smoothly" body="No jerky movements" />
          <Hint title="Stay focused" body="Track the entire path" />
        </div>
      </div>
    </div>
  );
}

function Hint({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-blue-50 p-3 text-xs">
      <div className="font-semibold text-blue-900">{title}</div>
      <div className="text-blue-700">{body}</div>
    </div>
  );
}

// --- Pure analysis helpers --------------------------------------------------

function calculateSmoothness(gazePath: readonly PathPoint[]): number {
  if (gazePath.length < 3) return 0;
  let smoothSegments = 0;
  for (let i = 2; i < gazePath.length; i++) {
    const a = gazePath[i - 2];
    const b = gazePath[i - 1];
    const c = gazePath[i];
    if (!a || !b || !c) continue;
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const velocityChange = Math.hypot(v2x - v1x, v2y - v1y);
    if (velocityChange < SMOOTH_VELOCITY_THRESHOLD) smoothSegments += 1;
  }
  return (smoothSegments / (gazePath.length - 2)) * 100;
}

function calculateLatency(
  targetPath: readonly PathPoint[],
  gazePath: readonly PathPoint[],
): number {
  let totalLatency = 0;
  let samples = 0;
  for (let i = 0; i < Math.min(targetPath.length, gazePath.length - 5); i++) {
    const targetPoint = targetPath[i];
    if (!targetPoint) continue;
    const closest = closestInTime(gazePath, targetPoint.time);
    if (!closest) continue;
    const distance = Math.hypot(closest.point.x - targetPoint.x, closest.point.y - targetPoint.y);
    if (distance < FOLLOWING_DISTANCE_THRESHOLD) {
      totalLatency += closest.timeDiff;
      samples += 1;
    }
  }
  return samples > 0 ? totalLatency / samples : 0;
}

function calculateAccuracy(
  targetPath: readonly PathPoint[],
  gazePath: readonly PathPoint[],
): number {
  let totalDistance = 0;
  let samples = 0;
  for (const gazePoint of gazePath) {
    const closest = closestInTime(targetPath, gazePoint.time);
    if (!closest) continue;
    totalDistance += Math.hypot(gazePoint.x - closest.point.x, gazePoint.y - closest.point.y);
    samples += 1;
  }
  const avgDistance = samples > 0 ? totalDistance / samples : 100;
  return Math.max(0, 100 - avgDistance);
}

function detectSaccades(gazePath: readonly PathPoint[]): number {
  let saccades = 0;
  for (let i = 1; i < gazePath.length; i++) {
    const prev = gazePath[i - 1];
    const curr = gazePath[i];
    if (!prev || !curr) continue;
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > SACCADE_THRESHOLD_PX) saccades += 1;
  }
  return saccades;
}

function closestInTime(path: readonly PathPoint[], time: number) {
  if (!path.length) return null;
  let best = path[0];
  if (!best) return null;
  let bestDiff = Math.abs(best.time - time);
  for (const point of path) {
    const diff = Math.abs(point.time - time);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = point;
    }
  }
  return { point: best, timeDiff: bestDiff };
}
