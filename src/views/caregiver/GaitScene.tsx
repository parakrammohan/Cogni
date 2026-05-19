import GaitPanel from "../../components/panels/GaitPanel";
import type { GaitAnalysis } from "../../features/motion/lib/gait";
import type { MotionSample } from "../../types/app";

interface GaitSceneProps {
  gait: GaitAnalysis;
  motionSamples: MotionSample[];
}

function gaitRiskClasses(label: GaitAnalysis["label"]): { surface: string; text: string } {
  if (label === "Fall detected") return { surface: "border-red-200 bg-red-50", text: "text-red-700" };
  if (label === "High fall risk") return { surface: "border-amber-200 bg-amber-50", text: "text-amber-700" };
  if (label === "Irregular") return { surface: "border-sky-200 bg-sky-50", text: "text-sky-700" };
  if (label === "Calibrating" || label === "No data")
    return { surface: "border-slate-200 bg-slate-50", text: "text-slate-700" };
  return { surface: "border-emerald-200 bg-emerald-50", text: "text-emerald-700" };
}

function signalStrength(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function GaitScene({ gait, motionSamples }: GaitSceneProps) {
  const classes = gaitRiskClasses(gait.label);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Gait &amp; fall risk
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          Variance-based shuffling and fall analysis from the live accelerometer stream.
        </p>
      </header>

      <GaitPanel motionSamples={motionSamples} gait={gait} />

      <section className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
        <div className={`rounded-2xl border p-5 shadow-(--shadow-soft) ${classes.surface}`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Risk summary
          </div>
          <div className={`mt-3 font-display text-4xl font-semibold ${classes.text}`}>
            {(gait.riskScore * 100).toFixed(0)}%
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900">{gait.label}</div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-400 to-red-500 transition-[width] duration-500"
              style={{ width: `${Math.max(8, gait.riskScore * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Reduced lift, uneven side-to-side sway, weak forward drive, and any sharp impact
            signature all push the risk higher.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:h-full">
          <SignalCard
            label="Vertical oscillation"
            value={gait.zStd.toFixed(2)}
            hint={`Lift concern ${signalStrength(gait.signals.verticalLift)}.`}
          />
          <SignalCard
            label="Lateral asymmetry"
            value={gait.xStd.toFixed(2)}
            hint={`Drift concern ${signalStrength(gait.signals.lateralDrift)}.`}
          />
          <SignalCard
            label="Forward momentum"
            value={gait.yStd.toFixed(2)}
            hint={`Drive concern ${signalStrength(gait.signals.forwardConsistency)}.`}
          />
          <SignalCard
            label="Impact / stillness"
            value={gait.fallDetected ? "Armed" : "Clear"}
            hint={`Spike ${signalStrength(gait.signals.impactSpike)}, stillness ${signalStrength(gait.signals.postImpactStillness)}. Peak ${gait.peakMagnitude.toFixed(2)}g.`}
            emphasis={gait.fallDetected ? "danger" : undefined}
          />
        </div>
      </section>
    </div>
  );
}

function SignalCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: "danger";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${emphasis === "danger" ? "text-red-600" : "text-slate-900"}`}
      >
        {value}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{hint}</p>
    </div>
  );
}
