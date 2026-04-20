import { offsetCoord } from "./analytics";

export function buildLocationScenarios(base) {
  const homeLoop = [
    [0, 0],
    [10, 8],
    [24, 14],
    [18, 26],
    [6, 24],
    [-8, 18],
    [-16, 10],
    [-6, -4],
    [8, -12],
    [20, -6],
  ];
  const pacing = [
    [170, 20],
    [214, 20],
    [171, 22],
    [213, 18],
    [170, 20],
    [214, 20],
    [171, 22],
    [213, 18],
  ];
  const dwelling = [
    [-172, 140],
    [-166, 145],
    [-164, 141],
    [-170, 146],
    [-168, 139],
    [-165, 144],
    [-171, 143],
    [-167, 147],
  ];

  return {
    home: homeLoop.map(([east, north]) => offsetCoord(base, east, north)),
    pacing: pacing.map(([east, north]) => offsetCoord(base, east, north)),
    dwelling: dwelling.map(([east, north]) => offsetCoord(base, east, north)),
  };
}

export function makeMotionSample(mode, seconds) {
  const phase = seconds % 6;
  const jitter = () => (Math.random() - 0.5) * 0.1;

  if (mode === "shuffling") {
    return {
      x: 0.34 * Math.sin(seconds * 7.2) + jitter(),
      y: 0.22 + 0.14 * Math.sin(seconds * 3.1) + jitter(),
      z: 0.13 * Math.sin(seconds * 4.6) + jitter() * 0.4,
    };
  }

  if (mode === "fall") {
    if (phase < 2.3) {
      return {
        x: 0.24 * Math.sin(seconds * 2.6) + jitter(),
        y: 0.86 + 0.28 * Math.sin(seconds * 2.7) + jitter(),
        z: 1.1 * Math.sin(seconds * 4.8) + jitter(),
      };
    }
    if (phase < 2.4) {
      return { x: 3.8, y: 4.3, z: 5.1 };
    }
    return {
      x: jitter() * 0.08,
      y: jitter() * 0.08,
      z: jitter() * 0.05,
    };
  }

  return {
    x: 0.18 * Math.sin(seconds * 2.9) + jitter(),
    y: 0.92 + 0.34 * Math.sin(seconds * 3) + jitter(),
    z: 1.16 * Math.sin(seconds * 5) + jitter(),
  };
}
