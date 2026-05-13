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
// Order around the right eye: inner → upper-near-inner → upper-near-outer →
// outer → lower-near-outer → lower-near-inner → close. Two purposes:
//   1. Polygon overlay renders without self-intersection.
//   2. EAR formula `|p2-p6| + |p3-p5|` becomes the two vertical eyelid
//      distances (385↔380 and 387↔373) instead of diagonals.
export const RIGHT_EYE_EAR = [362, 385, 387, 263, 373, 380] as const;

export const LEFT_IRIS_CENTER = 468;
export const RIGHT_IRIS_CENTER = 473;
export const LEFT_IRIS_EDGE = 469;
export const RIGHT_IRIS_EDGE = 474;

/** Eye-corner indices used to build a head-pose-stable iris frame. */
export const LEFT_EYE_OUTER_CORNER = 33;
export const LEFT_EYE_INNER_CORNER = 133;
export const RIGHT_EYE_INNER_CORNER = 362;
export const RIGHT_EYE_OUTER_CORNER = 263;

/** Eye contour outline points used for the canvas overlay. */
export const LEFT_EYE_CONTOUR = LEFT_EYE_EAR;
export const RIGHT_EYE_CONTOUR = RIGHT_EYE_EAR;

/**
 * Mid-line upper/lower eyelid landmarks for eye-aperture measurement.
 *
 * The vertical distance between these two is the eye aperture — it shrinks
 * when the user looks down (upper lid drops to cover more of the iris) and
 * grows when they look up (eyelid retracts). This is one of the strongest
 * vertical-gaze cues we have, because iris vertical position alone has very
 * little dynamic range relative to camera noise.
 */
export const LEFT_EYE_UPPER_LID = 159;
export const LEFT_EYE_LOWER_LID = 145;
export const RIGHT_EYE_UPPER_LID = 386;
export const RIGHT_EYE_LOWER_LID = 374;
