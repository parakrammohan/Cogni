import { useEffect, useRef } from "react";

import type { CalibrationSample } from "../features/vision/calibration";
import type { VisionMetrics } from "../features/vision/types";

const MAX_SAMPLES = 120;

interface UseClickStreamOptions {
  /** Live vision metrics; we read gazeFeatures from the freshest snapshot. */
  visionMetrics: VisionMetrics;
  /** Storage callback — caller persists the rolling buffer however it likes. */
  onSample: (sample: CalibrationSample) => void;
  /** Skip when not in a sensible state (sims off, no face, etc.). */
  enabled: boolean;
}

/**
 * Implicit calibration via click-stream.
 *
 * Premise: when a user clicks a button, they were almost certainly looking at
 * it just before the click. So (current gazeFeatures, click position
 * normalized to viewport %) is an "implicit" calibration sample. We buffer
 * these client-side; the explicit calibration regression can be re-run later
 * including these samples to refine the fit.
 *
 * Skipped when:
 *   - No live face mesh (gazeFeatures null)
 *   - The click target opted out via [data-skip-implicit-calibration]
 *   - Click coords are outside the viewport (defensive)
 *
 * The hook reads the latest visionMetrics from a ref so it never re-attaches
 * listeners on every render — vision metrics update at ~7 Hz.
 */
export function useClickStreamCalibration({
  visionMetrics,
  onSample,
  enabled,
}: UseClickStreamOptions) {
  const visionRef = useRef(visionMetrics);
  const onSampleRef = useRef(onSample);

  useEffect(() => {
    visionRef.current = visionMetrics;
  }, [visionMetrics]);

  useEffect(() => {
    onSampleRef.current = onSample;
  }, [onSample]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (event: MouseEvent | PointerEvent) => {
      const metrics = visionRef.current;
      if (!metrics.gazeFeatures || metrics.isBlinking) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-skip-implicit-calibration]")) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw <= 0 || vh <= 0) return;
      const xPct = (event.clientX / vw) * 100;
      const yPct = (event.clientY / vh) * 100;
      if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;

      onSampleRef.current({
        features: {
          eyeRelative: { ...metrics.gazeFeatures.eyeRelative },
          irisDiameter: metrics.gazeFeatures.irisDiameter,
        },
        screen: { x: xPct, y: yPct },
      });
    };

    // pointerdown captures faster than click and works for touch.
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [enabled]);
}

export const CLICK_STREAM_MAX_SAMPLES = MAX_SAMPLES;
