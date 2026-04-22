/**
 * SmoothPursuitTest.tsx
 * Smooth pursuit eye movement test for dementia screening
 */

import { useEffect, useRef, useState } from 'react';
import { Activity, Target } from 'lucide-react';

interface PursuitResult {
  smoothness: number; // 0-100%
  latency: number; // milliseconds
  accuracy: number; // 0-100%
  saccadeCount: number; // jerky movements
  risk: 'Low' | 'Moderate' | 'High';
}

interface SmoothPursuitTestProps {
  onTestComplete: (result: PursuitResult) => void;
  irisPosition: { x: number; y: number } | null; // From face mesh
  testDuration?: number; // seconds
}

export default function SmoothPursuitTest({ 
  onTestComplete, 
  irisPosition,
  testDuration = 15 
}: SmoothPursuitTestProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [timeRemaining, setTimeRemaining] = useState(testDuration);
  const [targetPosition, setTargetPosition] = useState({ x: 50, y: 50 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef<number>(0);
  const targetPathRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const gazePathRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const animationFrameRef = useRef<number>();

  // Start test
  const startTest = () => {
    setCountdown(3);
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
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

  // Animate target in smooth sine wave pattern
  useEffect(() => {
    if (!isRunning) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const startTime = Date.now();
    let animationActive = true;

    function animateTarget() {
      if (!animationActive || !canvas) return;

      const elapsed = (Date.now() - startTime) / 1000;
      const progress = elapsed / testDuration;

      if (progress >= 1) {
        // Test complete
        setIsRunning(false);
        analyzeResults();
        return;
      }

      // Circular motion pattern
      const angle = progress * 4 * Math.PI; // 2 full circles
      const radius = 35; // % from center
      const centerX = 50;
      const centerY = 50;

      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      setTargetPosition({ x, y });
      setTimeRemaining(Math.ceil(testDuration - elapsed));

      // Record target path
      targetPathRef.current.push({
        x,
        y,
        time: Date.now(),
      });

      animationFrameRef.current = requestAnimationFrame(animateTarget);
    }

    animateTarget();

    return () => {
      animationActive = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRunning, testDuration]);

  // Track gaze position
  useEffect(() => {
    if (!isRunning || !irisPosition) return;

    gazePathRef.current.push({
      x: irisPosition.x,
      y: irisPosition.y,
      time: Date.now(),
    });
  }, [irisPosition, isRunning]);

  // Analyze results
  const analyzeResults = () => {
    const targetPath = targetPathRef.current;
    const gazePath = gazePathRef.current;

    if (targetPath.length < 10 || gazePath.length < 10) {
      console.warn('Insufficient data for analysis');
      return;
    }

    // Calculate metrics
    const smoothness = calculateSmoothness(gazePath);
    const latency = calculateLatency(targetPath, gazePath);
    const accuracy = calculateAccuracy(targetPath, gazePath);
    const saccadeCount = detectSaccades(gazePath);

    // Assess risk
    let riskScore = 0;
    if (smoothness < 70) riskScore += 2;
    else if (smoothness < 85) riskScore += 1;
    
    if (latency > 250) riskScore += 2;
    else if (latency > 180) riskScore += 1;
    
    if (saccadeCount > 10) riskScore += 2;
    else if (saccadeCount > 5) riskScore += 1;

    const risk = riskScore >= 4 ? 'High' : riskScore >= 2 ? 'Moderate' : 'Low';

    const result: PursuitResult = {
      smoothness: Math.round(smoothness),
      latency: Math.round(latency),
      accuracy: Math.round(accuracy),
      saccadeCount,
      risk,
    };

    onTestComplete(result);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <Target size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Smooth Pursuit Test</h3>
              <p className="text-sm text-slate-600">Follow the moving target with your eyes</p>
            </div>
          </div>
          {!isRunning && countdown === 0 && (
            <button
              onClick={startTest}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Start Test
            </button>
          )}
        </div>

        {/* Test Canvas */}
        <div className="relative aspect-video overflow-hidden rounded-[16px] border border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100">
          <canvas ref={canvasRef} className="h-full w-full" />
          
          {/* Countdown */}
          {countdown > 0 && !isRunning && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90">
              <div className="text-center">
                <div className="text-6xl font-bold text-slate-900">{countdown}</div>
                <p className="mt-2 text-sm text-slate-600">Get ready...</p>
              </div>
            </div>
          )}

          {/* Moving Target */}
          {isRunning && (
            <>
              <div
                className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-red-500 bg-red-500/20 transition-all duration-75"
                style={{
                  left: `${targetPosition.x}%`,
                  top: `${targetPosition.y}%`,
                }}
              >
                <div className="absolute inset-0 animate-ping rounded-full border-2 border-red-500 opacity-75" />
              </div>

              {/* Timer */}
              <div className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm">
                {timeRemaining}s
              </div>
            </>
          )}

          {/* Instructions */}
          {!isRunning && countdown === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-md text-center">
                <Activity size={48} className="mx-auto mb-4 text-blue-600" />
                <h4 className="mb-2 text-lg font-semibold text-slate-900">Ready to begin</h4>
                <p className="text-sm text-slate-600">
                  A red target will move across the screen. Follow it smoothly with your eyes only—don't move your head.
                  The test will last {testDuration} seconds.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-blue-50 p-3 text-xs">
            <div className="font-semibold text-blue-900">Keep head still</div>
            <div className="text-blue-700">Only move your eyes</div>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-xs">
            <div className="font-semibold text-blue-900">Follow smoothly</div>
            <div className="text-blue-700">No jerky movements</div>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-xs">
            <div className="font-semibold text-blue-900">Stay focused</div>
            <div className="text-blue-700">Track the entire path</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Analysis Functions

function calculateSmoothness(gazePath: { x: number; y: number; time: number }[]): number {
  if (gazePath.length < 3) return 0;

  // Calculate velocity changes (jerkiness)
  let totalJerk = 0;
  let smoothSegments = 0;

  for (let i = 2; i < gazePath.length; i++) {
    const v1x = gazePath[i - 1].x - gazePath[i - 2].x;
    const v1y = gazePath[i - 1].y - gazePath[i - 2].y;
    const v2x = gazePath[i].x - gazePath[i - 1].x;
    const v2y = gazePath[i].y - gazePath[i - 1].y;

    const velocityChange = Math.sqrt(
      Math.pow(v2x - v1x, 2) + Math.pow(v2y - v1y, 2)
    );

    totalJerk += velocityChange;
    
    // Count smooth segments (low velocity change)
    if (velocityChange < 5) smoothSegments++;
  }

  // Smoothness as % of smooth segments
  const smoothness = (smoothSegments / (gazePath.length - 2)) * 100;
  return smoothness;
}

function calculateLatency(
  targetPath: { x: number; y: number; time: number }[],
  gazePath: { x: number; y: number; time: number }[]
): number {
  // Find average time delay between target movement and gaze following
  let totalLatency = 0;
  let samples = 0;

  for (let i = 0; i < Math.min(targetPath.length, gazePath.length - 5); i++) {
    const targetPoint = targetPath[i];
    
    // Find closest gaze point in time
    let closestGaze = gazePath[0];
    let minTimeDiff = Math.abs(gazePath[0].time - targetPoint.time);

    for (const gazePoint of gazePath) {
      const timeDiff = Math.abs(gazePoint.time - targetPoint.time);
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestGaze = gazePoint;
      }
    }

    // Check if gaze actually followed (within reasonable distance)
    const distance = Math.sqrt(
      Math.pow(closestGaze.x - targetPoint.x, 2) +
      Math.pow(closestGaze.y - targetPoint.y, 2)
    );

    if (distance < 20) { // Close enough to consider "following"
      totalLatency += minTimeDiff;
      samples++;
    }
  }

  return samples > 0 ? totalLatency / samples : 0;
}

function calculateAccuracy(
  targetPath: { x: number; y: number; time: number }[],
  gazePath: { x: number; y: number; time: number }[]
): number {
  // Calculate how closely gaze follows target path
  let totalDistance = 0;
  let samples = 0;

  for (const gazePoint of gazePath) {
    // Find closest target point in time
    let closestTarget = targetPath[0];
    let minTimeDiff = Math.abs(targetPath[0].time - gazePoint.time);

    for (const targetPoint of targetPath) {
      const timeDiff = Math.abs(targetPoint.time - gazePoint.time);
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestTarget = targetPoint;
      }
    }

    // Calculate distance
    const distance = Math.sqrt(
      Math.pow(gazePoint.x - closestTarget.x, 2) +
      Math.pow(gazePoint.y - closestTarget.y, 2)
    );

    totalDistance += distance;
    samples++;
  }

  const avgDistance = samples > 0 ? totalDistance / samples : 100;
  
  // Convert to accuracy percentage (lower distance = higher accuracy)
  const accuracy = Math.max(0, 100 - avgDistance);
  return accuracy;
}

function detectSaccades(gazePath: { x: number; y: number; time: number }[]): number {
  // Detect sudden jerky movements (saccades)
  let saccadeCount = 0;
  const SACCADE_THRESHOLD = 15; // pixels

  for (let i = 1; i < gazePath.length; i++) {
    const distance = Math.sqrt(
      Math.pow(gazePath[i].x - gazePath[i - 1].x, 2) +
      Math.pow(gazePath[i].y - gazePath[i - 1].y, 2)
    );

    if (distance > SACCADE_THRESHOLD) {
      saccadeCount++;
    }
  }

  return saccadeCount;
}
