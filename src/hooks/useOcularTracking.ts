/**
 * useOcularTracking.ts
 * Fixed: correct MediaPipe landmark indices, single unified loop,
 * proper 6-point EAR, real iris-centre export, blink hysteresis.
 */

import { useEffect, useRef, useState } from 'react';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs';

export interface OcularMetrics {
  ear: number;
  leftEAR: number;
  rightEAR: number;
  blinkDetected: boolean;
  blinkRate: number;       // blinks per minute
  fixation: number;        // 0-100 %
  latency: number;         // ms since last blink
  pupilDiameter: number;   // relative px
  trackingMode: 'idle' | 'camera-search' | 'live-mesh';
  faceDetected: boolean;
  landmarkCount: number;
  risk: 'Low' | 'Moderate' | 'High';
  /** Normalised iris centre [0-100, 0-100] for SmoothPursuitTest */
  irisPosition: { x: number; y: number } | null;
}

interface UseOcularTrackingProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  enabled: boolean;
}

// ─── Correct MediaPipe FaceMesh 468-point indices ────────────────────────────
// Each eye needs exactly 6 points for the standard EAR formula:
//   EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
//   p1 = outer corner, p4 = inner corner
//   p2,p3 = upper lid; p5,p6 = lower lid (mirrored)

// Left eye  (from camera's perspective = subject's left, appears on RIGHT of mirrored feed)
const L_P1  = 33;   // outer corner
const L_P2  = 160;  // upper lid outer
const L_P3  = 158;  // upper lid inner
const L_P4  = 133;  // inner corner
const L_P5  = 153;  // lower lid inner
const L_P6  = 144;  // lower lid outer

// Right eye
const R_P1  = 362;  // outer corner
const R_P2  = 385;  // upper lid outer
const R_P3  = 387;  // upper lid inner
const R_P4  = 263;  // inner corner
const R_P5  = 380;  // lower lid inner
const R_P6  = 373;  // lower lid outer

// Iris (only available when refineLandmarks: true)
const LEFT_IRIS_CENTER  = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_IRIS_EDGE    = 469; // for diameter
const RIGHT_IRIS_EDGE   = 474;

// EAR threshold below which a blink is counted
const EAR_BLINK_THRESHOLD = 0.20;
// Consecutive frames EAR must stay low to register a blink (debounce)
const BLINK_CONSEC_FRAMES = 2;

const DEFAULT_METRICS: OcularMetrics = {
  ear: 0,
  leftEAR: 0,
  rightEAR: 0,
  blinkDetected: false,
  blinkRate: 0,
  fixation: 0,
  latency: 0,
  pupilDiameter: 0,
  trackingMode: 'idle',
  faceDetected: false,
  landmarkCount: 0,
  risk: 'Low',
  irisPosition: null,
};

export function useOcularTracking({ videoRef, canvasRef, enabled }: UseOcularTrackingProps) {
  const [metrics, setMetrics] = useState<OcularMetrics>(DEFAULT_METRICS);

  // All mutable state lives in refs so the detection loop closure never stales.
  const detectorRef       = useRef<faceLandmarksDetection.FaceLandmarksDetector | null>(null);
  const rafRef            = useRef<number>(0);
  const runningRef        = useRef(false);

  const blinkCountRef     = useRef(0);
  const blinkConsecRef    = useRef(0);   // consecutive low-EAR frames
  const inBlinkRef        = useRef(false);
  const lastBlinkTimeRef  = useRef(0);
  const startTimeRef      = useRef(Date.now());
  const earWindowRef      = useRef<number[]>([]);  // rolling 90-frame window
  const frameCounterRef   = useRef(0);

  useEffect(() => {
    if (!enabled) {
      // Reset if disabled
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      detectorRef.current = null;
      setMetrics(DEFAULT_METRICS);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setMetrics(prev => ({ ...prev, trackingMode: 'camera-search' }));

      try {
        await tf.setBackend('webgl');
        await tf.ready();

        const detector = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'tfjs',
            refineLandmarks: true,  // enables 478 pts + iris
            maxFaces: 1,
          }
        );

        if (cancelled) return;

        detectorRef.current = detector;
        startTimeRef.current = Date.now();
        blinkCountRef.current = 0;
        runningRef.current = true;

        console.log('✅ FaceMesh ready | backend:', tf.getBackend());
        loop();
      } catch (err) {
        console.error('FaceMesh init failed:', err);
        if (!cancelled) setMetrics(prev => ({ ...prev, trackingMode: 'idle' }));
      }
    }

    // ── Main detection loop ────────────────────────────────────────────────
    function loop() {
      if (!runningRef.current || cancelled) return;

      const video  = videoRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;

      if (!video || !canvas || !detector) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Video not ready yet — keep waiting
      if (video.readyState < 2 || video.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Sync canvas pixel dimensions to video (only when they differ)
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Run async detection but re-schedule immediately so RAF stays smooth
      detect(detector, video, canvas, ctx).finally(() => {
        if (runningRef.current && !cancelled) {
          rafRef.current = requestAnimationFrame(loop);
        }
      });
    }

    async function detect(
      detector: faceLandmarksDetection.FaceLandmarksDetector,
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
    ) {
      try {
        const faces = await detector.estimateFaces(video, { flipHorizontal: false });

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!faces.length) {
          setMetrics(prev => ({
            ...prev,
            faceDetected: false,
            trackingMode: 'camera-search',
            landmarkCount: 0,
            irisPosition: null,
          }));
          return;
        }

        const kp = faces[0].keypoints as Array<{ x: number; y: number; z?: number }>;

        // ── EAR calculation ──────────────────────────────────────────────
        const leftEAR  = computeEAR(kp, L_P1, L_P2, L_P3, L_P4, L_P5, L_P6);
        const rightEAR = computeEAR(kp, R_P1, R_P2, R_P3, R_P4, R_P5, R_P6);
        const avgEAR   = (leftEAR + rightEAR) / 2;

        // ── Blink detection with hysteresis ──────────────────────────────
        let blinkDetected = false;
        if (avgEAR < EAR_BLINK_THRESHOLD) {
          blinkConsecRef.current++;
          if (blinkConsecRef.current >= BLINK_CONSEC_FRAMES && !inBlinkRef.current) {
            inBlinkRef.current = true;
            blinkCountRef.current++;
            blinkDetected = true;
            lastBlinkTimeRef.current = Date.now();
          }
        } else {
          blinkConsecRef.current = 0;
          inBlinkRef.current = false;
        }

        // ── EAR rolling window (90 frames ≈ 3 s at 30 fps) ──────────────
        earWindowRef.current.push(avgEAR);
        if (earWindowRef.current.length > 90) earWindowRef.current.shift();
        const earVariance = variance(earWindowRef.current);

        // ── Blink rate (blinks per minute) ───────────────────────────────
        const elapsedMin = (Date.now() - startTimeRef.current) / 60_000;
        const blinkRate  = elapsedMin > 0 ? blinkCountRef.current / elapsedMin : 0;

        // ── Iris centres (landmarks 468/473 from refineLandmarks) ─────────
        let irisPosition: { x: number; y: number } | null = null;
        let pupilDiameter = 0;
        if (kp.length > RIGHT_IRIS_CENTER) {
          const lc = kp[LEFT_IRIS_CENTER];
          const rc = kp[RIGHT_IRIS_CENTER];
          // Average of both iris centres, normalised to canvas %
          irisPosition = {
            x: ((lc.x + rc.x) / 2 / canvas.width)  * 100,
            y: ((lc.y + rc.y) / 2 / canvas.height) * 100,
          };
          // Diameter from centre to edge landmark
          pupilDiameter = (
            dist(kp[LEFT_IRIS_CENTER],  kp[LEFT_IRIS_EDGE]) +
            dist(kp[RIGHT_IRIS_CENTER], kp[RIGHT_IRIS_EDGE])
          ) / 2;
        }

        // ── Fixation quality ─────────────────────────────────────────────
        const fixation = Math.max(0, Math.min(100, 100 - earVariance * 1000));

        // ── Latency (ms since last blink) ────────────────────────────────
        const latency = lastBlinkTimeRef.current
          ? Math.min(Date.now() - lastBlinkTimeRef.current, 9999)
          : 0;

        // ── Dementia risk ────────────────────────────────────────────────
        const risk = assessRisk(blinkRate, earVariance, avgEAR);

        // ── Draw overlays ────────────────────────────────────────────────
        drawMesh(ctx, kp);
        drawEyeContour(ctx, kp, [L_P1, L_P2, L_P3, L_P4, L_P5, L_P6]);
        drawEyeContour(ctx, kp, [R_P1, R_P2, R_P3, R_P4, R_P5, R_P6]);
        if (kp.length > RIGHT_IRIS_CENTER) {
          drawIris(ctx, kp[LEFT_IRIS_CENTER],  pupilDiameter);
          drawIris(ctx, kp[RIGHT_IRIS_CENTER], pupilDiameter);
        }

        // ── Periodic console diagnostics (every 120 frames) ──────────────
        frameCounterRef.current++;
        if (frameCounterRef.current % 120 === 0) {
          console.log('👁️ Ocular:', {
            landmarks: kp.length,
            avgEAR: avgEAR.toFixed(3),
            blinkRate: blinkRate.toFixed(1),
            risk,
            backend: tf.getBackend(),
          });
        }

        setMetrics({
          ear:          parseFloat(avgEAR.toFixed(3)),
          leftEAR:      parseFloat(leftEAR.toFixed(3)),
          rightEAR:     parseFloat(rightEAR.toFixed(3)),
          blinkDetected,
          blinkRate:    parseFloat(blinkRate.toFixed(1)),
          fixation:     Math.round(fixation),
          latency:      Math.round(latency),
          pupilDiameter: parseFloat(pupilDiameter.toFixed(2)),
          trackingMode: 'live-mesh',
          faceDetected: true,
          landmarkCount: kp.length,
          risk,
          irisPosition,
        });
      } catch (err) {
        console.warn('Detection frame error:', err);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, videoRef, canvasRef]);

  return metrics;
}

// ─── Pure helper functions ────────────────────────────────────────────────────

type KP = { x: number; y: number };

function dist(a: KP, b: KP): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Standard 6-point Eye Aspect Ratio
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
function computeEAR(
  kp: KP[],
  i1: number, i2: number, i3: number,
  i4: number, i5: number, i6: number,
): number {
  const horizontal = dist(kp[i1], kp[i4]);
  if (horizontal < 1e-6) return 0;
  return (dist(kp[i2], kp[i6]) + dist(kp[i3], kp[i5])) / (2 * horizontal);
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function assessRisk(blinkRate: number, earVariance: number, avgEAR: number): 'Low' | 'Moderate' | 'High' {
  // Clinical references:
  //   Normal blink rate: 10–20 /min
  //   Parkinson's/dementia: often < 10 or > 30
  //   High EAR variance → unstable oculomotor control
  let score = 0;

  if      (blinkRate < 8  || blinkRate > 32) score += 3;
  else if (blinkRate < 10 || blinkRate > 25) score += 1;

  if      (earVariance > 0.005) score += 2;
  else if (earVariance > 0.002) score += 1;

  if (avgEAR < 0.15) score += 1;   // droopy / ptosis

  if (score >= 4) return 'High';
  if (score >= 2) return 'Moderate';
  return 'Low';
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

function drawMesh(ctx: CanvasRenderingContext2D, kp: KP[]) {
  ctx.fillStyle = 'rgba(0,255,255,0.35)';
  // Sparse dot mesh — draw every 4th landmark for perf
  for (let i = 0; i < kp.length; i += 4) {
    ctx.beginPath();
    ctx.arc(kp[i].x, kp[i].y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEyeContour(ctx: CanvasRenderingContext2D, kp: KP[], indices: number[]) {
  ctx.strokeStyle = 'rgba(0,255,80,0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  indices.forEach((idx, i) => {
    const p = kp[idx];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();
}

function drawIris(ctx: CanvasRenderingContext2D, centre: KP, radius: number) {
  const r = Math.max(radius, 4);
  ctx.strokeStyle = 'rgba(255,220,0,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair
  ctx.strokeStyle = 'rgba(255,220,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centre.x - r * 1.4, centre.y);
  ctx.lineTo(centre.x + r * 1.4, centre.y);
  ctx.moveTo(centre.x, centre.y - r * 1.4);
  ctx.lineTo(centre.x, centre.y + r * 1.4);
  ctx.stroke();
}