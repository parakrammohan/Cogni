import { Camera, Target } from "lucide-react";
import { useState } from "react";

import SmoothPursuitTest from "../../components/SmoothPursuitTest";
import { Button } from "../../components/ui/Button";
import type { VisionMetrics } from "../../features/vision/types";

interface PursuitSceneProps {
  visionMetrics: VisionMetrics;
  cameraStatus: string;
  onEnableCamera: () => void;
  onGoToOcular: () => void;
}

interface PursuitResult {
  smoothness: number;
  latency: number;
  accuracy: number;
  saccadeCount: number;
}

export function PursuitScene({
  visionMetrics,
  cameraStatus,
  onEnableCamera,
  onGoToOcular,
}: PursuitSceneProps) {
  const [result, setResult] = useState<PursuitResult | null>(null);
  const live = cameraStatus === "live";
  const tracking = visionMetrics.irisPosition !== null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Pursuit test
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          Follow the moving target with your eyes for 15 seconds. We measure smoothness, latency,
          and saccade count — markers used in oculomotor research.
        </p>
      </header>

      {!live ? (
        <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
              <Camera size={20} aria-hidden />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Camera needed</h3>
              <p className="mt-1 max-w-md text-sm text-slate-700">
                The pursuit test reads your iris position from the camera. Enable it to begin.
              </p>
            </div>
            <Button icon={<Camera size={16} />} onClick={onEnableCamera}>
              Enable camera
            </Button>
          </div>
        </div>
      ) : !tracking ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <div className="flex flex-col items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
              <Target size={20} aria-hidden />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Locking onto your face</h3>
              <p className="mt-1 max-w-md text-sm text-slate-700">
                Center your face in the Eye Check view, then come back. The test starts as soon
                as the live mesh is steady.
              </p>
            </div>
            <Button variant="secondary" onClick={onGoToOcular}>
              Open Eye Check
            </Button>
          </div>
        </div>
      ) : (
        <SmoothPursuitTest
          irisPosition={visionMetrics.irisPosition}
          onTestComplete={(r) =>
            setResult({
              smoothness: r.smoothness,
              latency: r.latency,
              accuracy: r.accuracy,
              saccadeCount: r.saccadeCount,
            })
          }
          testDuration={15}
        />
      )}

      {result ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ResultCard label="Smoothness" value={`${result.smoothness}%`} hint="Higher is better" />
          <ResultCard label="Latency" value={`${result.latency}ms`} hint="Lower is better" />
          <ResultCard label="Accuracy" value={`${result.accuracy}%`} hint="Path adherence" />
          <ResultCard
            label="Saccades"
            value={String(result.saccadeCount)}
            hint="Jerky movements"
          />
        </section>
      ) : null}
    </div>
  );
}

function ResultCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold text-slate-900 tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
