/**
 * WebEyeTrack integration — uses a pre-trained BlazeGaze CNN running in a
 * Web Worker (via TensorFlow.js) instead of our hand-rolled regression on
 * landmark ratios. The `webeyetrack` npm package wraps the model and a
 * built-in click-as-fixation calibrator.
 *
 * Why we use it for the pursuit test specifically:
 *   - The model is trained on huge gaze datasets so it generalizes far
 *     better than our 11-feature linear regression.
 *   - Calibration is built-in via clicks-as-fixations (the library
 *     attaches a global click listener and refines the model live).
 *   - It outputs already-screen-space coords, so we can skip our
 *     calibration → applyCalibration → Kalman pipeline entirely.
 *
 * What it doesn't replace:
 *   - EAR, blink rate, fixation, ocular risk — those still come from our
 *     useVision pipeline because WebEyeTrack only emits gaze position,
 *     not those clinical signals.
 *
 * Lifecycle:
 *   - The package is heavy (~2.6 MB JS + 670 KB model weights). We
 *     dynamic-import it from inside the hook so it only ships in the
 *     pursuit-test code path.
 *   - The library expects an HTMLVideoElement by id; we create a hidden
 *     one inside the hook so we don't fight useVision for the visible
 *     canvas video.
 */

import { useEffect, useRef, useState } from "react";

export interface WebEyeTrackGaze {
  /** Screen-coord percent [0, 100], canvas-frame convention. */
  x: number;
  y: number;
  /** Eye state: "open" or "closed" (closed during a blink). */
  state: "open" | "closed";
  /** ms timestamp from the worker. */
  timestamp: number;
}

interface UseWebEyeTrackOptions {
  /** When false the hook is dormant — no worker, no camera, no model load. */
  enabled: boolean;
}

interface UseWebEyeTrackResult {
  gaze: WebEyeTrackGaze | null;
  /** Last error from the library / model load, if any. */
  error: string | null;
  /** "idle" before init, "loading" during model fetch, "ready" once gazing. */
  status: "idle" | "loading" | "ready" | "error";
}

// Module-level singleton so re-mounting the pursuit test doesn't re-spin
// the worker each time. The worker pulls 670 KB of weights and takes ~1s
// to warm up; we keep it alive for the page's lifetime once initialized.
let videoEl: HTMLVideoElement | null = null;
let proxy: unknown = null;
let loadPromise: Promise<void> | null = null;
let lastGaze: WebEyeTrackGaze | null = null;
type Listener = (g: WebEyeTrackGaze) => void;
const listeners = new Set<Listener>();

function ensureVideoElement(): HTMLVideoElement {
  if (videoEl) return videoEl;
  const el = document.createElement("video");
  el.id = "webeyetrack-video";
  el.autoplay = true;
  el.playsInline = true;
  el.muted = true;
  el.style.display = "none";
  document.body.appendChild(el);
  videoEl = el;
  return el;
}

async function ensureProxy(): Promise<void> {
  if (proxy) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { WebcamClient, WebEyeTrackProxy } = await import("webeyetrack");
    const el = ensureVideoElement();
    const client = new WebcamClient(el.id);
    const p = new WebEyeTrackProxy(client);
    p.onGazeResults = (result) => {
      const nx = result.normPog?.[0];
      const ny = result.normPog?.[1];
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
      // normPog is in [-0.5, 0.5] with origin at screen centre and +Y
      // pointing down. Map to our [0, 100] percent convention.
      const x = ((nx as number) + 0.5) * 100;
      const y = ((ny as number) + 0.5) * 100;
      const gaze: WebEyeTrackGaze = {
        x,
        y,
        state: result.gazeState,
        timestamp: result.timestamp ?? Date.now(),
      };
      lastGaze = gaze;
      for (const l of listeners) l(gaze);
    };
    proxy = p;
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

export function useWebEyeTrack({ enabled }: UseWebEyeTrackOptions): UseWebEyeTrackResult {
  const [gaze, setGaze] = useState<WebEyeTrackGaze | null>(lastGaze);
  const [status, setStatus] = useState<UseWebEyeTrackResult["status"]>(
    proxy ? "ready" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const setGazeRef = useRef(setGaze);
  setGazeRef.current = setGaze;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setStatus(proxy ? "ready" : "loading");
    ensureProxy()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });

    const listener: Listener = (g) => setGazeRef.current(g);
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [enabled]);

  return { gaze, error, status };
}
