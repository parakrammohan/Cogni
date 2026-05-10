import { useCallback, useEffect, useRef, useState } from "react";

import type { AlertInput, SensorState } from "../../types/app";
import { clamp } from "../../lib/utils";
import {
  BlinkDetector,
  computeEar,
  rollingVariance,
  assessOcularRisk,
  type NormalizedLandmark,
} from "./ear";
import { LEFT_EYE_EAR, LEFT_IRIS_CENTER, RIGHT_EYE_EAR, RIGHT_IRIS_CENTER } from "./landmarks";
import { drawFaceMesh, drawSimulationOverlay } from "./overlay";
import { simulatedGaze, simulatedTarget } from "./simulation";
import { DEFAULT_VISION_METRICS, type VisionDebug, type VisionMetrics } from "./types";

const MEDIAPIPE_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Throttle metric state pushes to ~7 per second (avoid React render storm) */
const STATE_PUSH_INTERVAL_MS = 140;
/** EAR rolling window size at ~60 FPS = ~1.5 s */
const EAR_WINDOW_SIZE = 90;

type FaceLandmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => { faceLandmarks: NormalizedLandmark[][] };
  close: () => void;
};

type LoadedModule = {
  FaceLandmarker: {
    createFromOptions: (
      resolver: unknown,
      options: Record<string, unknown>,
    ) => Promise<FaceLandmarker>;
  };
  FilesetResolver: {
    forVisionTasks: (wasmBase: string) => Promise<unknown>;
  };
};

const initialDebug: VisionDebug = {
  backend: "uninitialized",
  detectorLoaded: false,
  streamActive: false,
  videoReadyState: 0,
  videoWidth: 0,
  videoHeight: 0,
  lastFaceCount: 0,
  lastInferenceMs: 0,
  lastInferenceAt: null,
  lastError: null,
  lockReason: "Camera inactive",
};

interface UseVisionOptions {
  /** When false, the simulated gaze overlay is suppressed; the canvas stays clean. */
  simulate: boolean;
}

export function useVision({ simulate }: UseVisionOptions) {
  const [cameraStatus, setCameraStatus] = useState<SensorState>("offline");
  const [visionStatus, setVisionStatus] = useState<SensorState>(
    simulate ? "simulation" : "offline",
  );
  const [metrics, setMetrics] = useState<VisionMetrics>(DEFAULT_VISION_METRICS);
  const [debug, setDebug] = useState<VisionDebug>(initialDebug);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const moduleRef = useRef<LoadedModule | null>(null);
  const rafRef = useRef<number | null>(null);
  const blinkDetectorRef = useRef<BlinkDetector>(new BlinkDetector());
  const earWindowRef = useRef<number[]>([]);
  const irisHistoryRef = useRef<{ x: number; y: number }[]>([]);
  const debugRef = useRef<VisionDebug>(initialDebug);
  const fixationStateRef = useRef({
    lane: -1,
    laneChangedAt: 0,
    latencyCaptured: false,
    latency: 0,
    deviation: [] as number[],
    lastPush: 0,
    startedAt: performance.now(),
  });

  const writeDebug = useCallback((patch: Partial<VisionDebug>) => {
    debugRef.current = { ...debugRef.current, ...patch };
    setDebug(debugRef.current);
  }, []);

  /** Lazy-load the MediaPipe Tasks SDK and initialize the FaceLandmarker. */
  const loadModule = useCallback(async () => {
    if (moduleRef.current) return moduleRef.current;
    const mod = (await import("@mediapipe/tasks-vision")) as unknown as LoadedModule;
    moduleRef.current = mod;
    return mod;
  }, []);

  const ensureLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    const mod = await loadModule();
    const resolver = await mod.FilesetResolver.forVisionTasks(WASM_BASE);
    const landmarker = await mod.FaceLandmarker.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: "VIDEO",
      numFaces: 1,
    });
    landmarkerRef.current = landmarker;
    writeDebug({ backend: "mediapipe", detectorLoaded: true, lastError: null });
    return landmarker;
  }, [loadModule, writeDebug]);

  const prewarmVisionRuntime = useCallback(async () => {
    try {
      await loadModule();
    } catch (err) {
      writeDebug({ lastError: `prewarm failed: ${(err as Error).message}` });
    }
  }, [loadModule, writeDebug]);

  const enableCamera = useCallback(
    async (onError?: (alert: AlertInput) => void) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError?.({
          module: "System",
          severity: "warning",
          title: "Camera unavailable",
          message:
            "This browser does not support getUserMedia. The ocular workflow will run in simulation.",
          dedupeKey: "camera-unavailable",
        });
        setCameraStatus("simulation");
        setVisionStatus("simulation");
        return;
      }

      try {
        setCameraStatus("requesting");
        setVisionStatus("loading");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraStatus("live");
        writeDebug({
          streamActive: true,
          lastError: null,
          lockReason: "Camera stream acquired",
        });

        try {
          await ensureLandmarker();
          setVisionStatus("live");
          writeDebug({ lockReason: "Detector ready, awaiting face lock" });
        } catch (err) {
          setVisionStatus("simulation");
          writeDebug({
            detectorLoaded: false,
            lastError: `Detector init failed: ${(err as Error).message}`,
            lockReason: "Detector unavailable; running fallback overlay",
          });
          onError?.({
            module: "Vision",
            severity: "warning",
            title: "Face mesh model unavailable",
            message:
              "Camera is active but the mesh model could not load. Continuing with simulated gaze.",
            dedupeKey: "vision-model-failed",
          });
        }
      } catch (err) {
        setCameraStatus("simulation");
        setVisionStatus("simulation");
        writeDebug({
          streamActive: false,
          detectorLoaded: false,
          lastError: `Camera error: ${(err as Error).message}`,
          lockReason: "No live camera stream",
        });
        onError?.({
          module: "System",
          severity: "warning",
          title: "Camera permission denied",
          message: "Live camera access was rejected. The ocular workflow stays testable in simulation mode.",
          dedupeKey: "camera-denied",
        });
      }
    },
    [ensureLandmarker, writeDebug],
  );

  const disableCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus("offline");
    setVisionStatus("simulation");
    blinkDetectorRef.current = new BlinkDetector();
    earWindowRef.current = [];
    writeDebug({
      streamActive: false,
      lastFaceCount: 0,
      lockReason: "Camera inactive",
    });
  }, [writeDebug]);

  // --- Main RAF loop ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let cancelled = false;

    function frame() {
      if (cancelled) return;
      // Pause RAF when tab is hidden
      if (typeof document !== "undefined" && document.hidden) {
        rafRef.current = window.setTimeout(frame, 200) as unknown as number;
        return;
      }
      tickFrame();
      rafRef.current = requestAnimationFrame(frame);
    }

    function tickFrame() {
      if (!canvas || !ctx) return;
      // Resize canvas to match its CSS pixel size for crisp drawing.
      const desiredWidth = canvas.clientWidth;
      const desiredHeight = canvas.clientHeight;
      if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
        canvas.width = desiredWidth || 640;
        canvas.height = desiredHeight || 360;
      }
      const width = canvas.width;
      const height = canvas.height;
      const now = performance.now();

      // Branch 1: live mesh
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const liveReady =
        cameraStatus === "live" &&
        visionStatus === "live" &&
        video !== null &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        landmarker !== null;

      if (liveReady && video && landmarker) {
        try {
          const startedAt = performance.now();
          const result = landmarker.detectForVideo(video, now);
          const inferenceMs = performance.now() - startedAt;
          const faces = result.faceLandmarks;
          const landmarks = faces[0];

          writeDebug({
            lastFaceCount: faces.length,
            lastInferenceMs: Math.round(inferenceMs),
            lastInferenceAt: Date.now(),
            videoReadyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            lastError: null,
          });

          if (landmarks && landmarks.length > 0) {
            renderLiveFrame(ctx, landmarks, width, height, now);
            return;
          }
          // Camera is on, model loaded, but no face yet
          renderCameraSearchFrame(ctx, width, height);
          return;
        } catch (err) {
          writeDebug({ lastError: `Inference threw: ${(err as Error).message}` });
        }
      }

      // Branch 2: simulation overlay (only when explicitly enabled)
      if (simulate) {
        renderSimulationFrame(ctx, width, height, now);
      } else {
        // Camera is off and simulation is off — clean canvas, no fake data.
        ctx.clearRect(0, 0, width, height);
        maybePushMetrics(now, { ...DEFAULT_VISION_METRICS, source: "Camera off" });
      }
    }

    function renderLiveFrame(
      ctx: CanvasRenderingContext2D,
      landmarks: NormalizedLandmark[],
      width: number,
      height: number,
      now: number,
    ) {
      const leftEar = computeEar(landmarks, LEFT_EYE_EAR);
      const rightEar = computeEar(landmarks, RIGHT_EYE_EAR);
      const avgEar = (leftEar + rightEar) / 2;
      blinkDetectorRef.current.tick(avgEar);
      earWindowRef.current.push(avgEar);
      if (earWindowRef.current.length > EAR_WINDOW_SIZE) earWindowRef.current.shift();

      const earVar = rollingVariance(earWindowRef.current);
      const blinkRate = blinkDetectorRef.current.rate;
      const risk = assessOcularRisk(blinkRate, earVar, avgEar, earWindowRef.current.length);

      const lc = landmarks[LEFT_IRIS_CENTER];
      const rc = landmarks[RIGHT_IRIS_CENTER];
      const irisPosition =
        lc && rc
          ? {
              x: clamp(((lc.x + rc.x) / 2) * 100, 0, 100),
              y: clamp(((lc.y + rc.y) / 2) * 100, 0, 100),
            }
          : null;

      // Fixation = stability of iris position over a rolling ~3s window.
      // Independent of blink state — closed-eye frames don't update history.
      // Score is 100 minus pixel-space std-dev (clamped). Rock-still gaze ≈ 100,
      // wandering gaze drops toward 0.
      let fixation = 0;
      if (irisPosition && !blinkDetectorRef.current.isBlinking) {
        const history = irisHistoryRef.current;
        history.push(irisPosition);
        if (history.length > 90) history.shift();
        if (history.length >= 8) {
          const xs = history.map((p) => p.x);
          const ys = history.map((p) => p.y);
          const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
          const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
          const varX = xs.reduce((s, v) => s + (v - meanX) ** 2, 0) / xs.length;
          const varY = ys.reduce((s, v) => s + (v - meanY) ** 2, 0) / ys.length;
          const stdDev = Math.sqrt(varX + varY);
          fixation = clamp(100 - stdDev * 12, 0, 100);
        }
      }

      drawFaceMesh({ ctx, landmarks, width, height, mirror: true });

      maybePushMetrics(now, {
        ear: avgEar,
        leftEar,
        rightEar,
        blinkRate,
        fixation,
        latency: Math.round(blinkDetectorRef.current.latency),
        mode: "live",
        trackingMode: "live-mesh",
        faceDetected: true,
        landmarkCount: landmarks.length,
        irisPosition,
        risk,
        source: "Live face mesh",
      });
    }

    function renderCameraSearchFrame(
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
    ) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(8, 17, 26, 0.45)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#edf5f2";
      ctx.font = "600 13px IBM Plex Sans, sans-serif";
      ctx.fillText("Searching for face...", 18, 28);

      maybePushMetrics(performance.now(), {
        ear: 0,
        leftEar: 0,
        rightEar: 0,
        blinkRate: 0,
        fixation: 0,
        latency: 0,
        mode: "live",
        trackingMode: "camera-search",
        faceDetected: false,
        landmarkCount: 0,
        irisPosition: null,
        risk: "Low",
        source: "Camera live, awaiting face",
      });
    }

    function renderSimulationFrame(
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      now: number,
    ) {
      const elapsed = now - fixationStateRef.current.startedAt;
      const target = simulatedTarget(elapsed, width, height);
      const gaze = simulatedGaze(target, now);
      const fixState = fixationStateRef.current;
      if (target.lane !== fixState.lane) {
        fixState.lane = target.lane;
        fixState.laneChangedAt = now;
        fixState.latencyCaptured = false;
      }
      const deviation = Math.hypot(gaze.x - target.x, gaze.y - target.y);
      fixState.deviation.push(deviation);
      if (fixState.deviation.length > 60) fixState.deviation.shift();
      const fixation =
        (fixState.deviation.filter((d) => d < 34).length / Math.max(1, fixState.deviation.length)) *
        100;
      if (deviation < 28 && !fixState.latencyCaptured) {
        fixState.latencyCaptured = true;
        fixState.latency = now - fixState.laneChangedAt;
      }

      const latency = fixState.latency || 420;
      const risk: VisionMetrics["risk"] = latency > 520 || fixation < 60 ? "High" : fixation < 74 ? "Moderate" : "Low";

      const source =
        cameraStatus === "live" && visionStatus !== "live"
          ? "Camera active / mesh unavailable"
          : "Simulated gaze";

      drawSimulationOverlay(ctx, target, gaze, width, height, {
        fixation,
        latency,
        source,
      });

      maybePushMetrics(now, {
        ear: 0.28,
        leftEar: 0.28,
        rightEar: 0.28,
        blinkRate: 14,
        fixation: Math.round(fixation),
        latency: Math.round(latency),
        mode: cameraStatus === "live" ? visionStatus : "simulation",
        trackingMode: cameraStatus === "live" && visionStatus !== "live" ? "camera-search" : "simulation",
        faceDetected: false,
        landmarkCount: 0,
        irisPosition: null,
        risk,
        source,
      });
    }

    function maybePushMetrics(now: number, next: VisionMetrics) {
      const fixState = fixationStateRef.current;
      if (now - fixState.lastPush < STATE_PUSH_INTERVAL_MS) return;
      fixState.lastPush = now;
      setMetrics(next);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        clearTimeout(rafRef.current);
      }
    };
  }, [cameraStatus, visionStatus, simulate, writeDebug]);

  // Track the simulate flag flipping mid-session so visionStatus stays in sync.
  useEffect(() => {
    if (simulate && visionStatus === "offline") setVisionStatus("simulation");
    if (!simulate && visionStatus === "simulation") setVisionStatus("offline");
  }, [simulate, visionStatus]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    },
    [],
  );

  return {
    videoRef,
    canvasRef,
    cameraStatus,
    visionStatus,
    visionMetrics: metrics,
    visionDebug: debug,
    enableCamera,
    disableCamera,
    prewarmVisionRuntime,
  };
}
