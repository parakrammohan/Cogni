import { useEffect, useMemo, useRef, useState } from "react";

import { MAX_MOTION_SAMPLES } from "../constants/app";
import { analyzeGait } from "../lib/analytics";
import { average } from "../lib/utils";
import { makeMotionSample } from "../lib/simulation";
import type { AlertInput, MotionSample, SensorState } from "../types/app";

export function useMotionTracking() {
  const [motionScenario, setMotionScenario] = useState("normal");
  const [motionStatus, setMotionStatus] = useState<SensorState>("simulation");
  const [motionSamples, setMotionSamples] = useState<MotionSample[]>([]);

  const motionRawRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);

  useEffect(() => {
    if (motionStatus !== "simulation") return undefined;

    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const raw = makeMotionSample(motionScenario, (performance.now() - startedAt) / 1000);
      motionRawRef.current = [...motionRawRef.current.slice(-5), raw];
      const smoothed = {
        x: average(motionRawRef.current.map((sample) => sample.x)),
        y: average(motionRawRef.current.map((sample) => sample.y)),
        z: average(motionRawRef.current.map((sample) => sample.z)),
        timestamp: Date.now(),
      };
      const magnitude = Math.sqrt(smoothed.x ** 2 + smoothed.y ** 2 + smoothed.z ** 2);
      setMotionSamples((previous) =>
        [...previous, { ...smoothed, magnitude }].slice(-MAX_MOTION_SAMPLES),
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
        const sample = event.acceleration || event.accelerationIncludingGravity;
        if (!sample) return;

        motionRawRef.current = [
          ...motionRawRef.current.slice(-5),
          { x: sample.x || 0, y: sample.y || 0, z: sample.z || 0 },
        ];

        const smoothed = {
          x: average(motionRawRef.current.map((entry) => entry.x)),
          y: average(motionRawRef.current.map((entry) => entry.y)),
          z: average(motionRawRef.current.map((entry) => entry.z)),
          timestamp: Date.now(),
        };
        const magnitude = Math.sqrt(smoothed.x ** 2 + smoothed.y ** 2 + smoothed.z ** 2);
        setMotionSamples((previous) =>
          [...previous, { ...smoothed, magnitude }].slice(-MAX_MOTION_SAMPLES),
        );
      };

      window.addEventListener("devicemotion", motionListenerRef.current);
      setMotionStatus("live");
    } catch {
      setMotionStatus("simulation");
      onError?.({
        module: "System",
        severity: "warning",
        title: "Motion permission unavailable",
        message: "DeviceMotion could not be enabled. Using synthetic gait data instead.",
        dedupeKey: "motion-denied",
      });
    }
  }

  function disableMotion() {
    if (motionListenerRef.current) {
      window.removeEventListener("devicemotion", motionListenerRef.current);
      motionListenerRef.current = null;
    }
    setMotionStatus("simulation");
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
