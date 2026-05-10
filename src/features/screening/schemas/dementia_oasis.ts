import type { ScreeningGroup } from "./common";

/* OASIS longitudinal — 10 features. eTIV / nWBV / ASF are MRI-derived
 * brain volume metrics; population-median defaults from the model meta
 * are applied when no MRI is available. */
export const DEMENTIA_OASIS_GROUPS: ScreeningGroup[] = [
  {
    title: "Subject",
    description: "Demographics + visit timing",
    fields: [
      {
        name: "Sex", label: "Sex", kind: "select", default: 0,
        options: [{ value: 0, label: "Female" }, { value: 1, label: "Male" }],
      },
      { name: "Age", label: "Age", kind: "number", default: 77, min: 50, max: 100, step: 1, unit: "yrs" },
      { name: "EDUC", label: "Years of education", kind: "number", default: 15, min: 0, max: 25, step: 1 },
      { name: "SES", label: "Socioeconomic status", kind: "number", default: 2, min: 1, max: 5, step: 1, hint: "1 = highest, 5 = lowest" },
      { name: "Visit", label: "Visit number", kind: "number", default: 2, min: 1, max: 5, step: 1 },
      { name: "MR Delay", label: "Days since first visit", kind: "number", default: 552, min: 0, max: 2000, step: 1, unit: "days" },
    ],
  },
  {
    title: "Cognitive",
    description: "Mini-Mental State Exam",
    fields: [
      { name: "MMSE", label: "MMSE", kind: "number", default: 27, min: 0, max: 30, step: 1, hint: "Mini-Mental State Exam 0–30" },
    ],
  },
  {
    title: "MRI brain volumes",
    description: "From MRI segmentation. Defaults are dataset medians when MRI isn't available.",
    fields: [
      { name: "eTIV", label: "eTIV", kind: "number", default: 1470, min: 1100, max: 2000, step: 1, unit: "mm³", hint: "Estimated total intracranial volume" },
      { name: "nWBV", label: "nWBV", kind: "number", default: 0.729, min: 0.55, max: 0.85, step: 0.001, hint: "Normalized whole-brain volume (0–1)" },
      { name: "ASF", label: "ASF", kind: "number", default: 1.194, min: 0.8, max: 1.6, step: 0.001, hint: "Atlas scaling factor" },
    ],
  },
];
