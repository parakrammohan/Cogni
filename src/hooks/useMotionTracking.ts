import { useEffect, useMemo, useRef, useState } from "react";

import { MAX_MOTION_SAMPLES } from "../constants/app";
import { analyzeGait } from "../features/motion/lib/gait";
import {
  makeMotionSample,
  type MotionScenario,
} from "../features/motion/lib/motion-simulation";
import { average } from "../lib/utils";
import type { AlertInput, MotionSample, SensorState } from "../types/app";

interface UseMotionTrackingOptions {
  /** When false, the hook does not auto-run a synthetic accelerometer stream. */
  simulate: boolean;
}

type RawSample = {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
};

/** Six-point moving average over raw samples → a single MotionSample
 *  with both linear (x/y/z + magnitude) and rotational (rotX/rotY/rotZ
 *  + rotMagnitude) fields ready for the gait sparklines. */
function smoothFromRaw(buffer: ReadonlyArray<RawSample>): MotionSample {
  const x = average(buffer.map((s) => s.x));
  const y = average(buffer.map((s) => s.y));
  const z = average(buffer.map((s) => s.z));
  const rotX = average(buffer.map((s) => s.rotX));
  const rotY = average(buffer.map((s) => s.rotY));
  const rotZ = average(buffer.map((s) => s.rotZ));
  return {
    x,
    y,
    z,
    magnitude: Math.sqrt(x * x + y * y + z * z),
    rotX,
    rotY,
    rotZ,
    rotMagnitude: Math.sqrt(rotX * rotX + rotY * rotY + rotZ * rotZ),
    timestamp: Date.now(),
  };
}

export function useMotionTracking({ simulate }: UseMotionTrackingOptions) {
  const [motionScenario, setMotionScenario] = useState<MotionScenario>("normal");
  const [motionStatus, setMotionStatus] = useState<SensorState>(
    simulate ? "simulation" : "offline",
  );
  const [motionSamples, setMotionSamples] = useState<MotionSample[]>([]);

  const motionRawRef = useRef<
    Array<{ x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number }>
  >([]);
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);

  // React to the `simulate` flag flipping mid-session.
  useEffect(() => {
    if (simulate && motionStatus === "offline") {
      setMotionStatus("simulation");
      return;
    }
    if (!simulate && motionStatus === "simulation") {
      setMotionStatus("offline");
      setMotionSamples([]);
    }
  }, [simulate, motionStatus]);

  useEffect(() => {
    if (motionStatus !== "simulation") return undefined;

    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const tSeconds = (performance.now() - startedAt) / 1000;
      const raw = makeMotionSample(motionScenario, tSeconds);
      motionRawRef.current = [
        ...motionRawRef.current.slice(-5),
        {
          x: raw.x,
          y: raw.y,
          z: raw.z,
          // Synthetic gyro: small rotation modulated by the scenario.
          // Real devices produce deg/s; we use the same scale here so
          // the sparklines look plausible without device hardware.
          rotX: raw.y * 4 + Math.sin(tSeconds * 2.0) * 0.6,
          rotY: -raw.x * 4 + Math.cos(tSeconds * 1.7) * 0.6,
          rotZ: Math.sin(tSeconds * 1.1) * 1.4,
        },
      ];
      setMotionSamples((previous) =>
        [...previous, smoothFromRaw(motionRawRef.current)].slice(-MAX_MOTION_SAMPLES),
      );
    }, 33);

    return () => window.clearInterval(interval);
  }, [motionScenario, motionStatus]);

  useEffect(
    () => () => {
      if (motionListenerRef.current) {
        window.removeEventListener("devicemotion", motionListenerRef.current);
      }
    },
    [],
  );

  async function enableMotion(onError?: (alert: AlertInput) => void) {
    try {
      setMotionStatus("requesting");

      if (motionListenerRef.current) {
        window.removeEventListener("devicemotion", motionListenerRef.current);
      }

      const motionPermissionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };

      if (
        typeof window.DeviceMotionEvent !== "undefined" &&
        typeof motionPermissionEvent.requestPermission === "function"
      ) {
        const result = await motionPermissionEvent.requestPermission();
        if (result !== "granted") {
          throw new Error("Motion permission not granted");
        }
      }

      motionListenerRef.current = (event) => {
        const accel = event.acceleration || event.accelerationIncludingGravity;
        if (!accel) return;
        // DeviceMotionEvent.rotationRate: alpha (around Z, deg/s),
        // beta (around X), gamma (around Y). Some browsers / desktop
        // emulators leave it null — fall back to zero.
        const rot = event.rotationRate ?? null;

        motionRawRef.current = [
          ...motionRawRef.current.slice(-5),
          {
            x: accel.x || 0,
            y: accel.y || 0,
            z: accel.z || 0,
            rotX: rot?.beta ?? 0,
            rotY: rot?.gamma ?? 0,
            rotZ: rot?.alpha ?? 0,
          },
        ];

        setMotionSamples((previous) =>
          [...previous, smoothFromRaw(motionRawRef.current)].slice(-MAX_MOTION_SAMPLES),
        );
      };

      window.addEventListener("devicemotion", motionListenerRef.current);
      setMotionStatus("live");
    } catch {
      setMotionStatus(simulate ? "simulation" : "offline");
      onError?.({
        module: "System",
        severity: "warning",
        title: "Motion permission unavailable",
        message: simulate
          ? "DeviceMotion could not be enabled. Using synthetic gait data instead."
          : "DeviceMotion could not be enabled. Enable simulations in Parameters to preview.",
        dedupeKey: "motion-denied",
      });
    }
  }

  function disableMotion() {
    if (motionListenerRef.current) {
      window.removeEventListener("devicemotion", motionListenerRef.current);
      motionListenerRef.current = null;
    }
    setMotionStatus(simulate ? "simulation" : "offline");
  }

  const gait = useMemo(() => analyzeGait(motionSamples), [motionSamples]);

  return {
    motionScenario,
    setMotionScenario,
    motionStatus,
    motionSamples,
    gait,
    enableMotion,
    disableMotion,
  };
}
