import { useEffect, useRef, useState } from "react";

import { LEFT_EYE, LEFT_IRIS, RIGHT_EYE, RIGHT_IRIS } from "../constants/app";
import {
  averagePoint,
  eyeAspectRatio,
  targetPosition,
} from "../lib/analytics";
import { clamp } from "../lib/utils";
import type { AlertInput, SensorState, VisionDebug, VisionMetrics } from "../types/app";

export function useVisionTracking() {
  const [cameraStatus, setCameraStatus] = useState<SensorState>("offline");
  const [visionStatus, setVisionStatus] = useState<SensorState>("simulation");
  const [visionMetrics, setVisionMetrics] = useState<VisionMetrics>({
    fixation: 72,
    latency: 420,
    ear: 0.28,
    blinkRate: 14,
    mode: "simulation",
    risk: "Moderate",
    source: "Simulated gaze",
    trackingMode: "simulation",
    faceDetected: false,
    landmarkCount: 0,
    irisPosition: { x: 50, y: 50 },
  });
  const [visionDebug, setVisionDebug] = useState<VisionDebug>({
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
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const visionModulesRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const debugRef = useRef<VisionDebug>({
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
  });
  const inferenceRef = useRef({
    pending: false,
    lane: -1,
    startedAt: performance.now(),
    latencyCaptured: false,
    recentDeviation: [],
    lastRun: 0,
    lastStatePush: 0,
    laneChangedAt: 0,
    latency: 420,
  });

  function pushDebug(patch: Partial<VisionDebug>) {
    debugRef.current = { ...debugRef.current, ...patch };
    setVisionDebug(debugRef.current);
  }

  useEffect(
    () => () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    },
    [],
  );

  useEffect(() => {
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStatus]);

  async function loadVisionModules() {
    if (visionModulesRef.current) return visionModulesRef.current;

    const [tf, faceLandmarksDetection] = await Promise.all([
      import("@tensorflow/tfjs-core"),
      import("@tensorflow-models/face-landmarks-detection"),
      import("@tensorflow/tfjs-converter"),
      import("@tensorflow/tfjs-backend-cpu"),
      import("@tensorflow/tfjs-backend-webgl"),
    ]).then(([tfModule, faceModule]) => [tfModule, faceModule]);

    visionModulesRef.current = { tf, faceLandmarksDetection };
    return visionModulesRef.current;
  }

  async function prewarmVisionRuntime() {
    try {
      await loadVisionModules();
    } catch {
      // Ignore prewarm failures and retry through the normal camera flow.
    }
  }

  async function ensureDetector() {
    if (detectorRef.current) return detectorRef.current;
    const { tf, faceLandmarksDetection } = await loadVisionModules();

    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    pushDebug({ backend: tf.getBackend(), lastError: null });

    detectorRef.current = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: "tfjs",
        refineLandmarks: true,
        maxFaces: 1,
      },
    );
    pushDebug({ detectorLoaded: true });
    return detectorRef.current;
  }

  async function enableCamera(onError?: (alert: AlertInput) => void) {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.({
        module: "System",
        severity: "warning",
        title: "Camera unavailable",
        message: "The browser lacks getUserMedia support. Running ocular diagnostics in simulation mode.",
        dedupeKey: "camera-unavailable",
      });
      setCameraStatus("simulation");
      setVisionStatus("simulation");
      return;
    }

    try {
      setCameraStatus("requesting");
      setVisionStatus("loading");
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      pushDebug({
        streamActive: true,
        lockReason: "Camera stream acquired",
        lastError: null,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play().catch(() => {});
      }

      setCameraStatus("live");

      try {
        await ensureDetector();
        setVisionStatus("live");
        pushDebug({ lockReason: "Detector ready, waiting for a face in frame" });
      } catch {
        setVisionStatus("simulation");
        pushDebug({
          detectorLoaded: false,
          lastError: "Face mesh model could not be loaded",
          lockReason: "Detector unavailable; running fallback vision",
        });
        onError?.({
          module: "Vision",
          severity: "warning",
          title: "Face mesh model unavailable",
          message: "Camera is active, but the mesh model could not be loaded. Simulated gaze overlay remains active.",
          dedupeKey: "vision-model-failed",
        });
      }
    } catch {
      setCameraStatus("simulation");
      setVisionStatus("simulation");
      pushDebug({
        streamActive: false,
        detectorLoaded: false,
        lastError: "Camera permission denied or stream start failed",
        lockReason: "No live camera stream",
      });
      onError?.({
        module: "System",
        severity: "warning",
        title: "Camera permission denied",
        message: "Live camera access was rejected. The ocular workflow stays testable with simulated gaze.",
        dedupeKey: "camera-denied",
      });
    }
  }

  function disableCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus("offline");
    setVisionStatus("simulation");
    pushDebug({
      streamActive: false,
      detectorLoaded: Boolean(detectorRef.current),
      lastFaceCount: 0,
      lockReason: "Camera inactive",
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let mounted = true;
    const startedAt = performance.now();

    async function frame(now: number) {
      if (!mounted) return;

      const width = canvas.width;
      const height = canvas.height;
      const target = targetPosition(now - startedAt, width, height);
      let gaze = {
        x: target.x + Math.sin(now / 340) * 18 + 22,
        y: target.y + Math.cos(now / 390) * 10,
      };
      let ear = 0.28 + Math.sin(now / 400) * 0.03;
      let source = "Simulated gaze";
      let trackingMode: VisionMetrics["trackingMode"] = "simulation";
      let landmarkCount = 0;
      let faceDetected = false;
      let blinkRate = Math.max(6, Math.min(28, 14 + Math.sin(now / 1800) * 4));
      let irisPosition = {
        x: clamp((gaze.x / Math.max(1, width)) * 100, 0, 100),
        y: clamp((gaze.y / Math.max(1, height)) * 100, 0, 100),
      };
      let eyeLoops: Array<Array<{ x: number; y: number }>> = [];
      let irisLoops: Array<Array<{ x: number; y: number }>> = [];
      let lockReason = "Simulation active";

      if (cameraStatus === "live" && visionStatus !== "live") {
        source = "Camera active / mesh unavailable";
        lockReason = "Camera is live but detector/runtime is not ready";
      }

      const projectPoint = (point: { x: number; y: number }) => ({
        x: (point.x / Math.max(1, videoRef.current?.videoWidth || width)) * width,
        y: (point.y / Math.max(1, videoRef.current?.videoHeight || height)) * height,
      });

      if (
        cameraStatus === "live" &&
        visionStatus === "live" &&
        videoRef.current?.readyState >= 2 &&
        detectorRef.current &&
        !inferenceRef.current.pending &&
        now - inferenceRef.current.lastRun > 120
      ) {
        trackingMode = "camera-search";
        source = "Camera active / searching for face";
        lockReason = "Inference running; looking for a face";
        inferenceRef.current.pending = true;
        inferenceRef.current.lastRun = now;

        try {
          const inferenceStartedAt = performance.now();
          const faces = await detectorRef.current.estimateFaces(videoRef.current, {
            flipHorizontal: true,
          });
          const face = faces?.[0];
          const inferenceMs = performance.now() - inferenceStartedAt;
          pushDebug({
            lastFaceCount: faces?.length || 0,
            lastInferenceMs: Math.round(inferenceMs),
            lastInferenceAt: Date.now(),
            videoReadyState: videoRef.current?.readyState || 0,
            videoWidth: videoRef.current?.videoWidth || 0,
            videoHeight: videoRef.current?.videoHeight || 0,
            lastError: null,
          });

          if (face?.keypoints?.length) {
            const keypoints = face.keypoints;
            const leftIris = averagePoint(LEFT_IRIS.map((index) => keypoints[index]).filter(Boolean));
            const rightIris = averagePoint(RIGHT_IRIS.map((index) => keypoints[index]).filter(Boolean));
            const leftCorner = keypoints[33];
            const rightCorner = keypoints[263];
            const top = keypoints[159];
            const bottom = keypoints[145];
            const iris = averagePoint([leftIris, rightIris]);

            if (leftCorner && rightCorner && top && bottom) {
              const ratioX = clamp((iris.x - leftCorner.x) / ((rightCorner.x - leftCorner.x) || 1), 0, 1);
              const ratioY = clamp((iris.y - top.y) / ((bottom.y - top.y) || 1), 0, 1);

              gaze = {
                x: clamp(width * (0.16 + ratioX * 0.68), 20, width - 20),
                y: clamp(height * (0.2 + ratioY * 0.55), 20, height - 20),
              };
              irisPosition = {
                x: clamp((gaze.x / Math.max(1, width)) * 100, 0, 100),
                y: clamp((gaze.y / Math.max(1, height)) * 100, 0, 100),
              };
              ear =
                (eyeAspectRatio(keypoints, LEFT_EYE) + eyeAspectRatio(keypoints, RIGHT_EYE)) / 2;
              blinkRate = Math.max(
                6,
                Math.min(30, 18 - (Math.max(0, 0.29 - ear) * 120) + Math.sin(now / 2400) * 2),
              );
              eyeLoops = [LEFT_EYE, RIGHT_EYE].map((indices) =>
                indices.map((index) => projectPoint(keypoints[index])).filter(Boolean),
              );
              irisLoops = [LEFT_IRIS, RIGHT_IRIS].map((indices) =>
                indices.map((index) => projectPoint(keypoints[index])).filter(Boolean),
              );
              source = "Live face mesh";
              trackingMode = "live-mesh";
              landmarkCount = [...LEFT_EYE, ...RIGHT_EYE, ...LEFT_IRIS, ...RIGHT_IRIS].length;
              faceDetected = true;
              lockReason = "Required eye and iris landmarks detected";
            } else {
              lockReason = "A face was found, but required eye landmarks were incomplete";
            }
          } else if (faces?.length) {
            lockReason = "Face candidate found, but no usable landmark set was returned";
          } else {
            lockReason = "No face detected in the current frame";
          }
        } catch {
          source = "Camera live / inference fallback";
          trackingMode = "camera-search";
          lockReason = "Inference failed during face estimation";
          pushDebug({ lastError: "Face estimation threw an error" });
        } finally {
          inferenceRef.current.pending = false;
        }
      }

      if (target.lane !== inferenceRef.current.lane) {
        inferenceRef.current.lane = target.lane;
        inferenceRef.current.laneChangedAt = now;
        inferenceRef.current.latencyCaptured = false;
      }

      const deviation = Math.hypot(gaze.x - target.x, gaze.y - target.y);
      inferenceRef.current.recentDeviation = [
        ...inferenceRef.current.recentDeviation.slice(-59),
        deviation,
      ];

      const fixation =
        (inferenceRef.current.recentDeviation.filter((value) => value < 34).length /
          Math.max(1, inferenceRef.current.recentDeviation.length)) *
        100;

      if (deviation < 28 && !inferenceRef.current.latencyCaptured) {
        inferenceRef.current.latencyCaptured = true;
        inferenceRef.current.latency = now - (inferenceRef.current.laneChangedAt || now);
      }

      const latency = inferenceRef.current.latency || 420;
      const risk = latency > 520 || fixation < 60 ? "High" : fixation < 74 ? "Moderate" : "Low";

      if (!inferenceRef.current.lastStatePush || now - inferenceRef.current.lastStatePush > 140) {
        inferenceRef.current.lastStatePush = now;
        setVisionMetrics({
          fixation: Math.round(fixation),
          latency: Math.round(latency),
          ear: Number(ear.toFixed(2)),
          blinkRate: Number(blinkRate.toFixed(1)),
          risk,
          source,
          mode: cameraStatus === "live" ? visionStatus : "simulation",
          trackingMode,
          faceDetected,
          landmarkCount,
          irisPosition,
        });
        pushDebug({
          streamActive: Boolean(streamRef.current),
          detectorLoaded: Boolean(detectorRef.current),
          videoReadyState: videoRef.current?.readyState || 0,
          videoWidth: videoRef.current?.videoWidth || 0,
          videoHeight: videoRef.current?.videoHeight || 0,
          lockReason,
        });
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(8,17,26,0.45)";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const drawLoop = (
        points: Array<{ x: number; y: number }>,
        stroke: string,
        fill?: string,
      ) => {
        if (!points.length) return;
        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = 16;
        ctx.shadowColor = stroke;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.stroke();
        if (fill) {
          ctx.fillStyle = fill;
          points.forEach((point) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3.6, 0, Math.PI * 2);
            ctx.fill();
          });
        }
        ctx.restore();
      };

      eyeLoops.forEach((loop) => drawLoop(loop, "rgba(109,226,255,0.96)", "rgba(109,226,255,0.95)"));
      irisLoops.forEach((loop) => drawLoop(loop, "rgba(255,111,77,0.98)", "rgba(255,111,77,0.96)"));

      ctx.fillStyle = "rgba(255,111,77,0.98)";
      ctx.beginPath();
      ctx.arc(target.x, target.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,111,77,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(109,226,255,0.95)";
      ctx.beginPath();
      ctx.arc(gaze.x, gaze.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(109,226,255,0.26)";
      ctx.beginPath();
      ctx.moveTo(target.x, target.y);
      ctx.lineTo(gaze.x, gaze.y);
      ctx.stroke();

      ctx.fillStyle = "#edf5f2";
      ctx.font = "600 12px IBM Plex Sans";
      ctx.fillText(`Latency ${Math.round(latency)}ms`, 18, 22);
      ctx.fillText(`Fixation ${Math.round(fixation)}%`, 18, 40);
      ctx.fillText(
        trackingMode === "live-mesh"
          ? `Live mesh ${landmarkCount} pts`
          : trackingMode === "camera-search"
            ? "Camera live / no face lock"
            : "Simulation mode",
        18,
        58,
      );

      ctx.fillStyle =
        trackingMode === "live-mesh"
          ? "rgba(10, 28, 33, 0.92)"
          : "rgba(26, 24, 18, 0.9)";
      ctx.fillRect(width - 212, 18, 194, 42);
      ctx.fillStyle = trackingMode === "live-mesh" ? "#6de2ff" : "#ffb48a";
      ctx.font = "700 12px IBM Plex Sans";
      ctx.fillText(
        trackingMode === "live-mesh" ? "LIVE FACE LANDMARKS" : "FALLBACK TRACKING",
        width - 196,
        35,
      );
      ctx.fillStyle = "#edf5f2";
      ctx.font = "500 11px IBM Plex Sans";
      ctx.fillText(source, width - 196, 51);

      rafRef.current = window.requestAnimationFrame(frame);
    }

    rafRef.current = window.requestAnimationFrame(frame);

    return () => {
      mounted = false;
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [cameraStatus, visionStatus]);

  return {
    videoRef,
    canvasRef,
    cameraStatus,
    visionStatus,
    visionMetrics,
    visionDebug,
    enableCamera,
    disableCamera,
    prewarmVisionRuntime,
  };
}
