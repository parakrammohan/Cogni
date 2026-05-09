/**
 * MediaPipe FaceMesh 478-landmark indices used by the vision pipeline.
 *
 * Six-point Eye Aspect Ratio (EAR) per Soukupová & Čech (2016):
 *   EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
 *
 *   p1 = outer corner, p4 = inner corner
 *   p2, p3 = upper lid (outer/inner)
 *   p5, p6 = lower lid (mirrored)
 *
 * Iris landmarks require `outputFaceLandmarks: true` (default for FaceLandmarker).
 */

export const LEFT_EYE_EAR = [33, 160, 158, 133, 153, 144] as const;
export const RIGHT_EYE_EAR = [362, 385, 387, 263, 380, 373] as const;

export const LEFT_IRIS_CENTER = 468;
export const RIGHT_IRIS_CENTER = 473;
export const LEFT_IRIS_EDGE = 469;
export const RIGHT_IRIS_EDGE = 474;

/** Eye contour outline points used for the canvas overlay. */
export const LEFT_EYE_CONTOUR = LEFT_EYE_EAR;
export const RIGHT_EYE_CONTOUR = RIGHT_EYE_EAR;
