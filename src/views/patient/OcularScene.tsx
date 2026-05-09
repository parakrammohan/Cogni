import { Activity, AlertTriangle, CheckCircle2, Eye, Info } from "lucide-react";
import type { ComponentType } from "react";

import { cx } from "../../lib/utils";
import type { VisionMetrics } from "../../features/vision/types";

interface OcularSceneProps {
  visionMetrics: VisionMetrics;
  /** Renders directly above this content; we just describe what's happening. */
  cameraStageSlot: React.ReactNode;
}

export function OcularScene({ visionMetrics, cameraStageSlot }: OcularSceneProps) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Eye check
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          Stay relaxed and look at the camera. We&apos;re watching your blink rate, eye-aspect
          ratio, and gaze stability — these are early indicators of cognitive change.
        </p>
      </header>

      {cameraStageSlot}

      {/* Live readouts */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Reading
          icon={Eye}
          label="Eye Aspect Ratio"
          value={visionMetrics.ear.toFixed(2)}
          context={
            visionMetrics.ear === 0
              ? "Waiting for face lock"
              : visionMetrics.ear < 0.2
                ? "Eyes closing detected"
                : "Eyes open and tracked"
          }
        />
        <Reading
          icon={Activity}
          label="Blink rate"
          value={`${visionMetrics.blinkRate.toFixed(0)}/min`}
          context={
            visionMetrics.blinkRate === 0
              ? "Waiting for first blink"
              : visionMetrics.blinkRate < 10
                ? "Lower than typical (10–20)"
                : visionMetrics.blinkRate > 25
                  ? "Higher than typical (10–20)"
                  : "Within typical range"
          }
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <SmallStat label="Fixation" value={`${visionMetrics.fixation}%`} />
        <SmallStat
          label="Tracker"
          value={
            visionMetrics.trackingMode === "live-mesh"
              ? "Locked"
              : visionMetrics.trackingMode === "camera-search"
                ? "Searching"
                : "Idle"
          }
        />
        <SmallStat label="Landmarks" value={String(visionMetrics.landmarkCount)} />
      </section>

      <BlinkStrip rate={visionMetrics.blinkRate} />

      <RiskBanner risk={visionMetrics.risk} faceDetected={visionMetrics.faceDetected} />
    </div>
  );
}

function Reading({
  icon: Icon,
  label,
  value,
  context,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  context: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-semibold text-slate-900 tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-xs text-slate-500">{context}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function BlinkStrip({ rate }: { rate: number }) {
  const isNormal = rate >= 10 && rate <= 20;
  const widthPct = Math.min((rate / 30) * 100, 100);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wider text-slate-500">Blink rate</span>
        <span className="font-semibold text-slate-800 tabular-nums">{rate.toFixed(0)}/min</span>
      </div>
      <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {/* Normal range band */}
        <div
          className="absolute inset-y-0 left-[33%] right-[33%] rounded-full bg-emerald-100"
          aria-hidden
        />
        <div
          className={cx(
            "relative h-full rounded-full transition-[width] duration-500",
            isNormal ? "bg-emerald-500" : "bg-amber-500",
          )}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>0</span>
        <span className="text-emerald-700">Normal 10–20</span>
        <span>30+</span>
      </div>
    </div>
  );
}

function RiskBanner({
  risk,
  faceDetected,
}: {
  risk: VisionMetrics["risk"];
  faceDetected: boolean;
}) {
  if (!faceDetected) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <Info size={18} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
        <p>
          Risk classification will appear once your face is locked. Center your face in the
          camera and stay still for a moment.
        </p>
      </div>
    );
  }

  if (risk === "High") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          <strong>Elevated ocular signals.</strong> Blink rate or stability suggests reviewing
          with a clinician. This isn&apos;t a diagnosis — it&apos;s a heuristic.
        </div>
      </div>
    );
  }

  if (risk === "Moderate") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
        <p>
          Moderate signals. Try the Pursuit Test to add another data point.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
      <p>Looking good — your eye-movement patterns are within typical ranges.</p>
    </div>
  );
}
