/**
 * Screening inference — used to run ONNX locally via onnxruntime-web;
 * now thin client over the backend endpoints. Same exported shapes so
 * the cards/forms don't need changes.
 *
 * The four model artifacts that used to live in /public/models/ are
 * now served by the FastAPI service at cogni-team-cogni.hf.space and
 * loaded by `app/ml/loader.py`.
 */

import { api } from "../../api/client";
import type {
  BinaryResult,
  InferenceResult,
  ModelKey,
  ModelMeta,
  MulticlassResult,
  RiskBand,
} from "./types";

interface BackendRunResponse {
  id: string;
  patient_id: string;
  model: ModelKey;
  probability: number;
  band: RiskBand;
  classes: string[];
  probabilities: number[] | null;
  top: string | null;
  confidence: number | null;
  created_at: string;
}

/**
 * The model "meta" is still useful for rendering schema-driven forms
 * (feature list, defaults). We fetch it lazily from /public/models —
 * these are tiny JSON files describing the input fields. The ONNX
 * weights themselves are no longer served from the frontend.
 */
const metaPromises: Partial<Record<ModelKey, Promise<ModelMeta>>> = {};

export function loadModelMeta(key: ModelKey): Promise<ModelMeta> {
  if (!metaPromises[key]) {
    metaPromises[key] = fetch(`/models/${key}.meta.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`failed to fetch meta ${key}: ${r.status}`);
        return r.json() as Promise<ModelMeta>;
      })
      .catch((err) => {
        delete metaPromises[key];
        throw err;
      });
  }
  return metaPromises[key]!;
}

/** Back-compat shim so any old callers expecting `loadModel(...)`
 *  still get the meta (the session is now server-side). */
export async function loadModel(key: ModelKey): Promise<{ meta: ModelMeta }> {
  return { meta: await loadModelMeta(key) };
}

function patientPath(patientId: string, model: ModelKey | "alzheimer-mri"): string {
  return `/api/v1/patients/${patientId}/screening/${model}`;
}

export async function runBinary(
  key: Exclude<ModelKey, "alzheimer_mri">,
  values: Record<string, number>,
  patientId: string,
): Promise<BinaryResult> {
  const meta = await loadModelMeta(key);
  const response = await api<BackendRunResponse>(patientPath(patientId, key), {
    method: "POST",
    json: { features: values },
  });
  return {
    kind: "binary",
    probability: response.probability,
    label: response.probability > 0.5 ? meta.classes[1] : meta.classes[0],
    riskBand: response.band,
  };
}

export async function runMulticlass(
  _key: "alzheimer_mri",
  imageBlob: Blob,
  patientId: string,
): Promise<MulticlassResult> {
  const form = new FormData();
  form.append("image", imageBlob, "upload.jpg");
  const response = await api<BackendRunResponse>(patientPath(patientId, "alzheimer-mri"), {
    method: "POST",
    body: form,
  });
  const meta = await loadModelMeta("alzheimer_mri");
  const probs = response.probabilities ?? meta.classes.map(() => 0);
  let topIndex = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topIndex]) topIndex = i;
  return {
    kind: "multiclass",
    probs,
    topIndex,
    topProb: probs[topIndex] ?? 0,
    topLabel: response.top ?? meta.classes[topIndex] ?? `class_${topIndex}`,
  };
}

export type { InferenceResult };
