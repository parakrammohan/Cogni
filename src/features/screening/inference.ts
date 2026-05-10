import * as ort from "onnxruntime-web";

import type { ScreeningMeta, ScreeningResult } from "./types";

// Bundled wasm artefacts via the PWA-cached jsDelivr mirror — keeps our own
// dist small and works offline after the first load (the workbox config
// already caches jsdelivr URLs).
ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";

const MODEL_URL = "/models/alzheimer_tabular.onnx";
const META_URL = "/models/alzheimer_tabular.meta.json";

let sessionPromise: Promise<{
  session: ort.InferenceSession;
  meta: ScreeningMeta;
}> | null = null;

export function loadScreeningModel() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const [modelResp, metaResp] = await Promise.all([
        fetch(MODEL_URL),
        fetch(META_URL),
      ]);
      if (!modelResp.ok) throw new Error(`failed to fetch model: ${modelResp.status}`);
      if (!metaResp.ok) throw new Error(`failed to fetch meta: ${metaResp.status}`);
      const buf = await modelResp.arrayBuffer();
      const meta = (await metaResp.json()) as ScreeningMeta;
      const session = await ort.InferenceSession.create(buf, {
        executionProviders: ["wasm"],
      });
      return { session, meta };
    })().catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

export async function runScreening(
  values: Record<string, number>,
): Promise<ScreeningResult> {
  const { session, meta } = await loadScreeningModel();
  const input = new Float32Array(meta.feature_count);
  meta.features.forEach((name, idx) => {
    const v = values[name];
    input[idx] = Number.isFinite(v) ? v : 0;
  });
  const tensor = new ort.Tensor("float32", input, [1, meta.feature_count]);
  const outputs = await session.run({ input: tensor });
  // skl2onnx GBM with zipmap=False emits ('label', 'probabilities')
  const probTensor = outputs.probabilities ?? outputs.output_probability;
  if (!probTensor) {
    throw new Error("ONNX output missing probability tensor");
  }
  const probs = probTensor.data as Float32Array;
  const probability = probs[1] ?? 0;
  const label = probability > 0.5 ? meta.classes[1] : meta.classes[0];
  const riskBand: ScreeningResult["riskBand"] =
    probability >= 0.7 ? "high" : probability >= 0.35 ? "moderate" : "low";
  return { probability, label, riskBand };
}
