import { motion } from "framer-motion";
import { AlertTriangle, ImageIcon, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { loadModel, runMulticlass } from "../../features/screening/inference";
import type { ModelMeta, MulticlassResult } from "../../features/screening/types";
import { useSubjectPatient } from "../../hooks/useSubjectPatient";

const IMG_SIZE = 64;
const KEY = "alzheimer_mri" as const;

const TONE: Record<string, { surface: string; ring: string; bar: string }> = {
  NonDemented: { surface: "bg-emerald-50 text-emerald-900", ring: "ring-emerald-200", bar: "bg-emerald-500" },
  VeryMildDemented: { surface: "bg-amber-50 text-amber-900", ring: "ring-amber-200", bar: "bg-amber-500" },
  MildDemented: { surface: "bg-orange-50 text-orange-900", ring: "ring-orange-200", bar: "bg-orange-500" },
  ModerateDemented: { surface: "bg-red-50 text-red-900", ring: "ring-red-300", bar: "bg-red-500" },
};

export function MriUploadCard() {
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MulticlassResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputArrayRef = useRef<Float32Array | null>(null);
  // The raw blob is what we POST to the backend (server does the resize +
  // normalize). The Float32Array stays for the local preview thumbnail.
  const inputBlobRef = useRef<Blob | null>(null);
  const { patientId } = useSubjectPatient();

  useEffect(() => {
    setModelStatus("loading");
    loadModel(KEY)
      .then(({ meta }) => {
        setMeta(meta);
        setModelStatus("ready");
      })
      .catch((err) => {
        setModelStatus("error");
        setError(err instanceof Error ? err.message : "Failed to load model");
      });
  }, []);

  function pickFile() {
    inputRef.current?.click();
  }

  async function loadFromFile(file: File) {
    setError(null);
    setResult(null);
    // Hard size cap mirrored on the server (10 MiB). Without this a
    // user-picked huge PNG decodes into hundreds of MiB of RGBA pixels
    // in the tab before any resize — and the unmodified blob would also
    // get POSTed, eating the HF Space upload budget.
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setError(
        `Image too large (${Math.round(file.size / 1024 / 1024)} MiB). Maximum is ${MAX_BYTES / 1024 / 1024} MiB.`,
      );
      return;
    }
    setFileName(file.name);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    inputBlobRef.current = file;
    try {
      const img = await loadImageElement(url);
      // Defensive megapixel cap — a 20kx20k image is within 10 MB on
      // disk after PNG compression but expands to ~1.6 GB of RGBA in
      // memory on decode. Reject before drawing it.
      if (img.naturalWidth * img.naturalHeight > 25_000_000) {
        setError(
          `Image dimensions too large (${img.naturalWidth}×${img.naturalHeight}). Maximum ~25 megapixels.`,
        );
        return;
      }
      const flat = imageToFlatGrayscale(img, IMG_SIZE);
      inputArrayRef.current = flat;
      const c = previewCanvasRef.current;
      if (c) {
        c.width = IMG_SIZE;
        c.height = IMG_SIZE;
        const ctx = c.getContext("2d");
        if (ctx) {
          const imageData = ctx.createImageData(IMG_SIZE, IMG_SIZE);
          for (let i = 0; i < flat.length; i++) {
            const v = Math.round(flat[i] * 255);
            imageData.data[i * 4] = v;
            imageData.data[i * 4 + 1] = v;
            imageData.data[i * 4 + 2] = v;
            imageData.data[i * 4 + 3] = 255;
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read image");
      inputArrayRef.current = null;
    }
  }

  async function predict() {
    if (!inputBlobRef.current) {
      setError("Pick an MRI image first.");
      return;
    }
    if (!patientId) {
      setError("Sign in as / pair with a patient before running screening.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const out = await runMulticlass(KEY, inputBlobRef.current, patientId);
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inference failed");
    } finally {
      setRunning(false);
    }
  }

  function clear() {
    setResult(null);
    setError(null);
    setFileName(null);
    inputArrayRef.current = null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 text-slate-700">
              <ImageIcon size={20} />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Upload an MRI slice</p>
              <p className="mt-0.5 text-sm text-slate-600">
                Axial T1 brain MRI image. Resized to {IMG_SIZE}×{IMG_SIZE}
                grayscale before inference.
              </p>
              {fileName ? (
                <p className="mt-1 text-xs text-slate-500">Loaded: {fileName}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={pickFile}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700"
            >
              <Upload size={16} />
              Choose image
            </button>
            {previewUrl ? (
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <X size={14} /> Clear
              </button>
            ) : null}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFromFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {previewUrl ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Original
            </p>
            <img
              src={previewUrl}
              alt="uploaded MRI"
              className="h-48 w-full rounded-xl object-contain bg-black"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Model input · {IMG_SIZE}×{IMG_SIZE} grayscale
            </p>
            <canvas
              ref={previewCanvasRef}
              className="mx-auto h-48 w-48 rounded-xl bg-black"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={predict}
          disabled={running || !inputArrayRef.current || modelStatus !== "ready"}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Classify image
        </button>
        {meta ? (
          <p className="text-xs text-slate-400">
            Trained on
            {typeof meta.metrics.train_size === "number"
              ? ` ${meta.metrics.train_size.toLocaleString()} `
              : meta.training_rows
                ? ` ${meta.training_rows.toLocaleString()} `
                : " "}
            MRI images
          </p>
        ) : null}
      </div>

      {modelStatus === "loading" ? (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" />
          Loading MRI model (~2.4 MiB)…
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {result && meta ? (
        <ResultPanel result={result} meta={meta} />
      ) : null}

      {meta?.caveats ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          <p className="font-semibold">Caveats baked into this model:</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {meta.caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ResultPanel({ result, meta }: { result: MulticlassResult; meta: ModelMeta }) {
  // OOD-flagged result: render an amber "needs review" panel instead of
  // a confident dementia label. Backend's predict_from_image sets
  // needsReview=true when the input looks like it isn't a brain MRI.
  if (result.needsReview) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl ring-2 ring-amber-300 bg-amber-50 p-5 text-amber-900"
      >
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Needs review
        </p>
        <p className="mt-1 font-display text-2xl font-semibold sm:text-3xl">
          This doesn't look like a brain MRI
        </p>
        <p className="mt-2 text-sm opacity-80">
          The image is in colour, has very low classifier confidence, or
          both — the model is trained only on grayscale T1 brain MRI
          slices. Re-upload an axial brain MRI to get a real prediction.
        </p>
      </motion.div>
    );
  }
  const tone = TONE[result.topLabel] ?? TONE.NonDemented;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-2xl ring-2 ${tone.ring} ${tone.surface} p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
            Predicted class
          </p>
          <p className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
            {result.topLabel}
          </p>
          <p className="mt-1 text-sm opacity-80">
            Confidence: {(result.topProb * 100).toFixed(1)}%
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {meta.classes.map((cls, i) => {
          const p = result.probs[i] ?? 0;
          return (
            <div key={cls}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{cls}</span>
                <span className="opacity-70">{(p * 100).toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${p * 100}%` }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className={`h-full rounded-full ${i === result.topIndex ? tone.bar : "bg-slate-400/60"}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function imageToFlatGrayscale(img: HTMLImageElement, size: number): Float32Array {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    // luminosity-weighted grayscale, normalized to [0, 1]
    const r = data[p], g = data[p + 1], b = data[p + 2];
    out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return out;
}
