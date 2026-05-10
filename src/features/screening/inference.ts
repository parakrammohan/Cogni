import * as ort from "onnxruntime-web";

import type {
  BinaryResult,
  InferenceResult,
  ModelKey,
  ModelMeta,
  MulticlassResult,
  RiskBand,
} from "./types";

ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";

interface LoadedModel {
  session: ort.InferenceSession;
  meta: ModelMeta;
}

const sessions: Partial<Record<ModelKey, Promise<LoadedModel>>> = {};

export function loadModel(key: ModelKey): Promise<LoadedModel> {
  if (!sessions[key]) {
    sessions[key] = (async () => {
      const [modelResp, metaResp] = await Promise.all([
        fetch(`/models/${key}.onnx`),
        fetch(`/models/${key}.meta.json`),
      ]);
      if (!modelResp.ok) throw new Error(`failed to fetch model ${key}: ${modelResp.status}`);
      if (!metaResp.ok) throw new Error(`failed to fetch meta ${key}: ${metaResp.status}`);
      const buf = await modelResp.arrayBuffer();
      const meta = (await metaResp.json()) as ModelMeta;
      const session = await ort.InferenceSession.create(buf, {
        executionProviders: ["wasm"],
      });
      return { session, meta };
    })().catch((err) => {
      delete sessions[key];
      throw err;
    });
  }
  return sessions[key]!;
}

function bandFor(p: number): RiskBand {
  return p >= 0.7 ? "high" : p >= 0.35 ? "moderate" : "low";
}

function readProbabilities(outputs: ort.InferenceSession.OnnxValueMapType): Float32Array {
  // skl2onnx with zipmap=False emits a 'probabilities' tensor; some converters
  // call it 'output_probability'. We accept either.
  const t = outputs.probabilities ?? outputs.output_probability;
  if (!t) throw new Error("ONNX output missing probability tensor");
  return t.data as Float32Array;
}

export async function runBinary(
  key: ModelKey,
  values: Record<string, number>,
): Promise<BinaryResult> {
  const { session, meta } = await loadModel(key);
  const fill = meta.missing_value_fill ?? 0;
  const x = new Float32Array(meta.feature_count);
  meta.features.forEach((name, idx) => {
    const v = values[name];
    x[idx] = Number.isFinite(v) ? v : fill;
  });
  const tensor = new ort.Tensor("float32", x, [1, meta.feature_count]);
  const outputs = await session.run({ input: tensor });
  const probs = readProbabilities(outputs);
  const probability = probs[1] ?? 0;
  return {
    kind: "binary",
    probability,
    label: probability > 0.5 ? meta.classes[1] : meta.classes[0],
    riskBand: bandFor(probability),
  };
}

export async function runMulticlass(
  key: ModelKey,
  flatInput: Float32Array,
): Promise<MulticlassResult> {
  const { session, meta } = await loadModel(key);
  if (flatInput.length !== meta.feature_count) {
    throw new Error(
      `Expected ${meta.feature_count} input values, got ${flatInput.length}`,
    );
  }
  const tensor = new ort.Tensor("float32", flatInput, [1, meta.feature_count]);
  const outputs = await session.run({ input: tensor });
  const probs = Array.from(readProbabilities(outputs));
  let topIndex = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topIndex]) topIndex = i;
  return {
    kind: "multiclass",
    probs,
    topIndex,
    topProb: probs[topIndex],
    topLabel: meta.classes[topIndex] ?? `class_${topIndex}`,
  };
}

export type { InferenceResult };
