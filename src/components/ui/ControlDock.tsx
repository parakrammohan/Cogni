import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { cx } from "../../lib/utils";

interface ControlDockProps {
  locationScenario: string;
  motionScenario: string;
  setLocationScenario: (value: string) => void;
  setMotionScenario: (value: string) => void;
}

export default function ControlDock({
  locationScenario,
  motionScenario,
  setLocationScenario,
  setMotionScenario,
}: ControlDockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open ? (
        <div className="glass w-[min(92vw,360px)] rounded-[28px] border border-white/12 bg-slate-950/90 p-4 shadow-[0_24px_80px_rgba(8,17,26,0.35)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-cyan">Operator Dock</div>
              <div className="mt-1 text-lg font-semibold text-white">Hidden controls</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-white"
              aria-label="Close operator dock"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-4">
            <label className="rounded-[22px] border border-white/10 bg-white/6 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Route profile</div>
              <select
                value={locationScenario}
                onChange={(event) => setLocationScenario(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-white outline-none"
              >
                <option value="home">Home loop</option>
                <option value="dwelling">Prolonged dwelling</option>
              </select>
            </label>

            <label className="rounded-[22px] border border-white/10 bg-white/6 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Gait profile</div>
              <select
                value={motionScenario}
                onChange={(event) => setMotionScenario(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-white outline-none"
              >
                <option value="normal">Normal</option>
                <option value="shuffling">Shuffling</option>
                <option value="fall">Fall event</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "flex items-center gap-3 rounded-full border px-5 py-4 text-sm font-semibold shadow-[0_18px_40px_rgba(8,17,26,0.28)]",
          open
            ? "border-white/15 bg-white/10 text-white"
            : "border-cyan/35 bg-cyan text-ink",
        )}
      >
        <SlidersHorizontal size={18} />
        {open ? "Hide controls" : "Open controls"}
      </button>
    </div>
  );
}
