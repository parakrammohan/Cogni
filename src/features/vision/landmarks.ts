/**
 * MediaPipe FaceMesh 478-landmark indices used by the vision pipeline.
 *
 * The 478-landmark model adds 10 dedicated iris/pupil points to the
 * base 468 face-mesh — indices 468..477 — which are output automatically
 * by MediaPipe Tasks Vision's FaceLandmarker when iris refinement is on
 * (the default for this model). Documentation:
 *   https://github.com/google/mediapipe/blob/master/docs/solutions/iris.md
 *
 * Naming note: indices follow MediaPipe convention (subject's right eye =
 * indices 33/133/468 etc.). The constants below are named from the
 * **viewer's perspective** because they're consumed by overlay drawing
 * on the displayed (mirrored) camera view — `LEFT_*` is the eye that
 * appears on the viewer's left side of the screen, which is the
 * subject's right eye anatomically.
 */

// ---- EAR (6 landmarks per eye) — used only for the EAR formula ----

/**
 * Six-point Eye Aspect Ratio (Soukupová & Čech, 2016):
 *   EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
 *
 *   p1 = outer corner, p4 = inner corner
 *   p2, p3 = upper lid (outer / inner)
 *   p5, p6 = lower lid (inner / outer)  — vertical pairings: 2↔6, 3↔5
 */
export const LEFT_EYE_EAR = [33, 160, 158, 133, 153, 144] as const;
// Right-eye order is chosen so the EAR pairings stay vertical AND the
// list traces a non-self-intersecting hexagon when used as a polygon.
export const RIGHT_EYE_EAR = [362, 385, 387, 263, 373, 380] as const;

// ---- Full 16-point eyelid contour — used for accurate overlay drawing ----

/**
 * Sixteen-point eyelid contour loops. These are the canonical "eye
 * outline" subsets used in MediaPipe-based gaze + fatigue research:
 *   - 8 upper-lid points + 8 lower-lid points around each eye
 *   - Ordered so consecutive indices trace a closed loop with no
 *     self-intersection (essential for polygon rendering)
 *
 * Source: MediaPipe iris-segmentation docs + community-curated landmark
 * subsets used in the public refine_landmarks=True examples.
 */
export const LEFT_EYE_CONTOUR = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
] as const;
export const RIGHT_EYE_CONTOUR = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
] as const;

// ---- Eye corner anchors (for head-pose-stable iris features) ----

export const LEFT_EYE_OUTER_CORNER = 33;
export const LEFT_EYE_INNER_CORNER = 133;
export const RIGHT_EYE_INNER_CORNER = 362;
export const RIGHT_EYE_OUTER_CORNER = 263;

// ---- Eyelid midpoints (for eye-aperture / iris-Y normalization) ----

/**
 * Mid-line upper/lower eyelid landmarks. The vertical distance between
 * these two anchors is the eye aperture — it shrinks when the patient
 * looks down (the upper lid drops to cover more of the iris) and grows
 * when they look up (the lid retracts). Strongest vertical-gaze cue.
 */
export const LEFT_EYE_UPPER_LID = 159;
export const LEFT_EYE_LOWER_LID = 145;
export const RIGHT_EYE_UPPER_LID = 386;
export const RIGHT_EYE_LOWER_LID = 374;

// ---- Iris / pupil landmarks (indices 468..477, refine_landmarks model) ----

/**
 * Pupil centres — the centre of the colored part of each eye. These are
 * MediaPipe's "iris centre" landmarks; they remain inside the iris
 * regardless of gaze and are the most reliable point for tracking.
 */
export const LEFT_IRIS_CENTER = 468;
export const RIGHT_IRIS_CENTER = 473;

/**
 * Four iris-boundary points per eye, in order: inner (nose side), top,
 * outer (temple side), bottom. Drawn as a quadrilateral they trace the
 * actual elliptical boundary of the iris — far more accurate than the
 * single-edge circle approximation we used previously.
 *
 *      [top]
 *  [inner] · [outer]
 *     [bottom]
 */
export const LEFT_IRIS_BOUNDARY = [469, 470, 471, 472] as const;
export const RIGHT_IRIS_BOUNDARY = [474, 475, 476, 477] as const;

// ---- Legacy single-edge fallback (kept for the depth proxy) ----

export const LEFT_IRIS_EDGE = 469;
export const RIGHT_IRIS_EDGE = 474;
