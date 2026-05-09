import { Activity, History, Target } from "lucide-react";
import type { RefObject } from "react";

import StatusBoard from "../../components/ui/StatusBoard";
import { faceLockTone, riskTone, trackerLabel, trackerTone } from "../../lib/tone";
import type { StoredPursuitResult } from "../../features/vision/pursuit-analysis";
import type { VisionMetrics } from "../../features/vision/types";
import { cx, relativeTime } from "../../lib/utils";

interface VisionSceneProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  visionMetrics: VisionMetrics;
  pursuitHistory: ReadonlyArray<StoredPursuitResult>;
}

export function VisionScene({
  videoRef,
  canvasRef,
  visionMetrics,
  pursuitHistory,
}: VisionSceneProps) {
  const latest = pursuitHistory.at(-1) ?? null;
  const recent = [...pursuitHistory].slice(-5).reverse();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Ocular biomarkers
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          Two pipelines: a continuous Eye Check (live blink and gaze stability), plus the patient-
          initiated Pursuit Test (oculomotor smoothness and latency).
        </p>
      </header>

      {/* Live Eye Check section */}
      <section className="space-y-3">
        <SectionHeading
          icon={<Activity size={14} />}
          eyebrow="Eye Check"
          title="Live mesh + biomarkers"
          subtitle="Continuous while the camera is enabled"
        />
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-300 bg-slate-900 shadow-(--shadow-card)">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Live camera feed"
              className="absolute inset-0 h-full w-full object-cover opacity-80"
            />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          </div>
          <StatusBoard
            columns="sm:grid-cols-2"
            items={[
              {
                label: "Tracker mode",
                value: trackerLabel(visionMetrics.trackingMode),
                tone: trackerTone(visionMetrics.trackingMode),
                detail:
                  visionMetrics.trackingMode === "live-mesh"
                    ? "Ocular landmarks actively locked."
                    : "Ocular capture initializing.",
              },
              {
                label: "Face lock",
                value: visionMetrics.faceDetected ? "Locked" : "Aligning",
                tone: faceLockTone(visionMetrics.faceDetected),
                detail: visionMetrics.faceDetected
                  ? `${visionMetrics.landmarkCount} landmarks feeding overlay.`
                  : "Awaiting stable eye landmarks.",
              },
              {
                label: "Ocular risk",
                value: visionMetrics.risk,
                tone: riskTone(visionMetrics.risk),
                detail: `EAR ${visionMetrics.ear.toFixed(2)}, blinks ${visionMetrics.blinkRate.toFixed(1)}/min.`,
              },
              {
                label: "Fixation",
                value: `${visionMetrics.fixation}%`,
                tone: "info",
                detail: "Iris-position stability over a 3-second window.",
              },
            ]}
          />
        </div>
      </section>

      {/* Pursuit test section */}
      <section className="space-y-3">
        <SectionHeading
          icon={<Target size={14} />}
          eyebrow="Pursuit Test"
          title="Smooth pursuit eye movement"
          subtitle="Patient-initiated, 15-second sessions"
        />
        {latest ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PursuitMetric
              label="Latest gain"
              value={latest.gain.toFixed(2)}
              hint="Ideal ≈ 1.00"
              warn={latest.gain < 0.7 || latest.gain > 1.3}
            />
            <PursuitMetric
              label="Accuracy"
              value={`${Math.round(latest.accuracy)}%`}
              hint="Path adherence"
              warn={latest.accuracy < 60}
            />
            <PursuitMetric
              label="Saccade rate"
              value={`${latest.saccadeRate.toFixed(2)}/s`}
              hint="Velocity spikes"
              warn={latest.saccadeRate > 1.5}
            />
            <PursuitMetric
              label="Latency"
              value={`${Math.round(latest.latency)}ms`}
              hint="Phase shift"
              warn={latest.latency > 280}
            />
          </div>
        ) : (
          <EmptyPursuit />
        )}

        {recent.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-(--shadow-soft)">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <History size={14} aria-hidden />
                Recent sessions
              </div>
              <span className="text-xs text-slate-500">
                {pursuitHistory.length} stored
              </span>
            </div>
            <ul>
              {recent.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cx(
                        "h-2 w-2 rounded-full",
                        entry.risk === "High"
                          ? "bg-red-500"
                          : entry.risk === "Moderate"
                            ? "bg-amber-500"
                            : "bg-emerald-500",
                      )}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-slate-900">
                      Gain {entry.gain.toFixed(2)} · {Math.round(entry.accuracy)}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {entry.saccadeRate.toFixed(2)} sacc/s · {Math.round(entry.latency)}ms ·{" "}
                    {relativeTime(entry.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SectionHeading({
  icon,
  eyebrow,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
          {eyebrow}
        </div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function PursuitMetric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border bg-white p-4 shadow-(--shadow-soft)",
        warn ? "border-amber-200" : "border-slate-200",
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyPursuit() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
      No pursuit-test sessions logged yet. The patient runs this test from the Pursuit tab in
      their view; results sync here automatically.
    </div>
  );
}
