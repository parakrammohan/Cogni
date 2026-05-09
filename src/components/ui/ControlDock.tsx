import { useState } from "react";
import { FlaskConical, X } from "lucide-react";

import type { LocationScenario } from "../../features/location/lib/scenarios";
import type { MotionScenario } from "../../features/motion/lib/motion-simulation";
import { cx } from "../../lib/utils";

interface ControlDockProps {
  locationScenario: LocationScenario;
  motionScenario: MotionScenario;
  setLocationScenario: (value: LocationScenario) => void;
  setMotionScenario: (value: MotionScenario) => void;
}

export default function ControlDock({
  locationScenario,
  motionScenario,
  setLocationScenario,
  setMotionScenario,
}: ControlDockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-40 flex flex-col items-end gap-3 lg:bottom-5 lg:right-5">
      {open ? (
        <div className="w-[min(92vw,360px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-elevated)">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700">
                Demo Simulator
              </div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">
                Preview demo scenarios
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close demo simulator"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
            >
              <X size={16} />
            </button>
          </div>

          <p className="mb-4 text-xs leading-5 text-slate-500">
            These selectors override the simulated sensor streams when no real GPS or motion data
            is available.
          </p>

          <div className="grid gap-3">
            <Field label="Route profile">
              <select
                value={locationScenario}
                onChange={(event) => setLocationScenario(event.target.value as LocationScenario)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
              >
                <option value="home">Home loop</option>
                <option value="pacing">Corridor pacing</option>
                <option value="dwelling">Prolonged dwelling</option>
              </select>
            </Field>

            <Field label="Gait profile">
              <select
                value={motionScenario}
                onChange={(event) => setMotionScenario(event.target.value as MotionScenario)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
              >
                <option value="normal">Normal</option>
                <option value="shuffling">Shuffling</option>
                <option value="fall">Fall event</option>
              </select>
            </Field>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Hide demo simulator" : "Open demo simulator"}
        className={cx(
          "inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-(--shadow-elevated) transition",
          open
            ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            : "bg-cyan-600 text-white hover:bg-cyan-500",
        )}
      >
        <FlaskConical size={16} aria-hidden />
        {open ? "Hide" : "Demo simulator"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
