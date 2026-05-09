export type MotionScenario = "normal" | "shuffling" | "fall";

interface RawSample {
  x: number;
  y: number;
  z: number;
}

const FALL_PHASE_DURATION_S = 6;
const FALL_IMPACT_START_S = 2.3;
const FALL_IMPACT_END_S = 2.4;

function jitter(): number {
  return (Math.random() - 0.5) * 0.1;
}

/**
 * Generates a synthetic accelerometer sample for a given gait scenario.
 * Phase advances continuously; the consumer passes elapsed seconds.
 */
export function makeMotionSample(scenario: MotionScenario, seconds: number): RawSample {
  if (scenario === "shuffling") {
    return {
      x: 0.34 * Math.sin(seconds * 7.2) + jitter(),
      y: 0.22 + 0.14 * Math.sin(seconds * 3.1) + jitter(),
      z: 0.13 * Math.sin(seconds * 4.6) + jitter() * 0.4,
    };
  }

  if (scenario === "fall") {
    const phase = seconds % FALL_PHASE_DURATION_S;
    if (phase < FALL_IMPACT_START_S) {
      return {
        x: 0.24 * Math.sin(seconds * 2.6) + jitter(),
        y: 0.86 + 0.28 * Math.sin(seconds * 2.7) + jitter(),
        z: 1.1 * Math.sin(seconds * 4.8) + jitter(),
      };
    }
    if (phase < FALL_IMPACT_END_S) {
      return { x: 3.8, y: 4.3, z: 5.1 };
    }
    return { x: jitter() * 0.08, y: jitter() * 0.08, z: jitter() * 0.05 };
  }

  return {
    x: 0.18 * Math.sin(seconds * 2.9) + jitter(),
    y: 0.92 + 0.34 * Math.sin(seconds * 3) + jitter(),
    z: 1.16 * Math.sin(seconds * 5) + jitter(),
  };
}
