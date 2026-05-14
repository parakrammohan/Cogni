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
import {
  LEFT_EYE_EAR,
  LEFT_EYE_INNER_CORNER,
  LEFT_EYE_LOWER_LID,
  LEFT_EYE_OUTER_CORNER,
  LEFT_EYE_UPPER_LID,
  LEFT_IRIS_CENTER,
  LEFT_IRIS_EDGE,
  RIGHT_EYE_EAR,
  RIGHT_EYE_INNER_CORNER,
  RIGHT_EYE_LOWER_LID,
  RIGHT_EYE_OUTER_CORNER,
  RIGHT_EYE_UPPER_LID,
  RIGHT_IRIS_CENTER,
  RIGHT_IRIS_EDGE,
} from "./landmarks";
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
  ) => {
    faceLandmarks: NormalizedLandmark[][];
    /** 4x4 column-major rigid transform per face (head pose). */
    facialTransformationMatrixes?: Array<{ data: Float32Array | number[] }>;
  };
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

/**
 * Decompose a 4x4 column-major rigid transform into YXZ Euler angles
 * (head yaw, pitch, roll). Returns zeros when the matrix is missing — the
 * regression then treats head pose as a constant for that frame and the
 * other features carry the gaze signal.
 *
 * Column-major layout: m[col*4 + row]. The rotation submatrix is in
 * columns 0..2, rows 0..2.
 */
function poseMatrixToEuler(
  matrix: Float32Array | number[] | null,
): { yaw: number; pitch: number; roll: number } {
  if (!matrix || matrix.length < 11) return { yaw: 0, pitch: 0, roll: 0 };
  const R10 = matrix[1]!;
  const R11 = matrix[5]!;
  const R02 = matrix[8]!;
  const R12 = matrix[9]!;
  const R22 = matrix[10]!;
  // YXZ decomposition.
  const pitch = Math.atan2(-R12, R22);
  const yaw = Math.atan2(R02, Math.sqrt(R12 * R12 + R22 * R22));
  const roll = Math.atan2(R10, R11);
  return { yaw, pitch, roll };
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
      outputFacialTransformationMatrixes: true,
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
        // Try with preferred constraints first (front camera, HD). If the
        // device has no camera matching facingMode (typical desktop/external
        // webcam — no front/back metadata), retry with the loosest possible
        // constraint and accept whatever the browser hands us.
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "user" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (firstErr) {
          if ((firstErr as { name?: string }).name === "NotFoundError") {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else {
            throw firstErr;
          }
        }
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
        const e = err as { name?: string; message?: string };
        setCameraStatus("simulation");
        setVisionStatus("simulation");
        writeDebug({
          streamActive: false,
          detectorLoaded: false,
          lastError: `Camera error: ${e.message ?? "unknown"}`,
          lockReason: "No live camera stream",
        });
        const isPermission = e.name === "NotAllowedError" || e.name === "SecurityError";
        const isNotFound = e.name === "NotFoundError";
        onError?.({
          module: "System",
          severity: "warning",
          title: isNotFound
            ? "No camera found"
            : isPermission
              ? "Camera permission denied"
              : "Camera could not start",
          message: isNotFound
            ? "No camera device was detected on this machine. Connect a webcam or enable simulations in Parameters."
            : isPermission
              ? "Live camera access was rejected. The ocular workflow stays testable in simulation mode."
              : `Camera failed to start: ${e.message ?? "unknown error"}.`,
          dedupeKey: "camera-error",
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
            const matrix = result.facialTransformationMatrixes?.[0]?.data ?? null;
            renderLiveFrame(ctx, landmarks, matrix, width, height, now);
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
      poseMatrix: Float32Array | number[] | null,
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

      // Head-pose-cancelled gaze features.
      //
      // Per eye we measure two ratios:
      //   - iris X within the eye-corner horizontal span   (cancels head
      //     translation since the eye corners ride with the head)
      //   - iris Y within the upper/lower-eyelid vertical span (a far
      //     stronger vertical cue than iris.y in image coords)
      // Plus an "eye openness" feature (eyelid aperture / eye width) that
      // captures the eyelid retraction the user does when looking up vs
      // down. Plus Euler angles from MediaPipe's facial transform matrix
      // so the regression can cancel head rotation explicitly.
      const lOuter = landmarks[LEFT_EYE_OUTER_CORNER];
      const lInner = landmarks[LEFT_EYE_INNER_CORNER];
      const rInner = landmarks[RIGHT_EYE_INNER_CORNER];
      const rOuter = landmarks[RIGHT_EYE_OUTER_CORNER];
      const lUpper = landmarks[LEFT_EYE_UPPER_LID];
      const lLower = landmarks[LEFT_EYE_LOWER_LID];
      const rUpper = landmarks[RIGHT_EYE_UPPER_LID];
      const rLower = landmarks[RIGHT_EYE_LOWER_LID];
      const lEdge = landmarks[LEFT_IRIS_EDGE];
      const rEdge = landmarks[RIGHT_IRIS_EDGE];

      let gazeFeatures: VisionMetrics["gazeFeatures"] = null;
      if (
        lc && rc &&
        lOuter && lInner && rInner && rOuter &&
        lUpper && lLower && rUpper && rLower &&
        lEdge && rEdge
      ) {
        const leftEyeW = lInner.x - lOuter.x;
        const leftLidH = lLower.y - lUpper.y;
        const rightEyeW = rOuter.x - rInner.x;
        const rightLidH = rLower.y - rUpper.y;
        if (
          Math.abs(leftEyeW) > 1e-6 && Math.abs(rightEyeW) > 1e-6 &&
          Math.abs(leftLidH) > 1e-6 && Math.abs(rightLidH) > 1e-6
        ) {
          // Iris X: 0 at outer corner, 1 at inner corner (per eye).
          const leftIrisX = (lc.x - lOuter.x) / leftEyeW;
          const rightIrisX = (rc.x - rInner.x) / rightEyeW;
          // Iris Y: 0 at upper lid, 1 at lower lid (per eye).
          const leftIrisY = (lc.y - lUpper.y) / leftLidH;
          const rightIrisY = (rc.y - rUpper.y) / rightLidH;
          // Eye openness: aperture / width. Shrinks when looking down.
          const leftEyeOpenness = leftLidH / leftEyeW;
          const rightEyeOpenness = rightLidH / rightEyeW;
          // Iris diameter — pixel-scale depth proxy.
          const irisDiameter = (
            Math.hypot(lc.x - lEdge.x, lc.y - lEdge.y) +
            Math.hypot(rc.x - rEdge.x, rc.y - rEdge.y)
          ) / 2;
          // Head Euler angles from the 4x4 column-major rigid transform.
          const { yaw, pitch, roll } = poseMatrixToEuler(poseMatrix);
          gazeFeatures = {
            leftIrisX, rightIrisX,
            leftIrisY, rightIrisY,
            leftEyeOpenness, rightEyeOpenness,
            headYaw: yaw,
            headPitch: pitch,
            headRoll: roll,
            irisDiameter,
          };
        }
      }

      // Face-to-camera distance from iris diameter. The iris is ~12 mm in
      // real life, so its size in normalized frame coords is a clean depth
      // proxy. Thresholds picked empirically for a typical 720p webcam at
      // arm's length on a 13-15" laptop.
      let faceDistance: VisionMetrics["faceDistance"] = null;
      if (gazeFeatures) {
        const d = gazeFeatures.irisDiameter;
        faceDistance = d < 0.018 ? "too-far" : d > 0.05 ? "too-close" : "good";
      }

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
        gazeFeatures,
        faceDistance,
        risk,
        source: "Live face mesh",
        isBlinking: blinkDetectorRef.current.isBlinking,
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
        gazeFeatures: null,
        faceDistance: null,
        risk: "Low",
        source: "Camera live, awaiting face",
        isBlinking: false,
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
        gazeFeatures: null,
        faceDistance: null,
        risk,
        source,
        isBlinking: false,
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

  /**
   * Attach the active camera stream to a secondary video element (e.g. a
   * picture-in-picture preview on the Pursuit Test scene). Returns a cleanup
   * that detaches the stream when the consumer unmounts.
   */
  const attachStreamTo = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return () => undefined;
    const stream = streamRef.current;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, []);

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
    attachStreamTo,
    /** Read directly from the detector ref for the freshest value (no React lag). */
    getIsBlinking: () => blinkDetectorRef.current.isBlinking,
  };
}
