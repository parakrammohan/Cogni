import { useEffect } from "react";
import { ArrowRight, BrainCircuit, Camera, CheckCircle2, MapPinned, MenuSquare, ShieldAlert, Sparkles, X } from "lucide-react";

interface OnboardingGuideProps {
  open: boolean;
  onClose: () => void;
  onBegin: () => void;
}

const steps = [
  {
    icon: <MenuSquare size={18} />,
    title: "Choose a surface",
    copy: "Start on Patient view for guided checks, or switch to Caregiver view for alerts, diagnostics, and trends.",
  },
  {
    icon: <MapPinned size={18} />,
    title: "Set the safe zone",
    copy: "Use the map panel and radius control to define the area the location engine compares against live or simulated movement.",
  },
  {
    icon: <Camera size={18} />,
    title: "Enable live sensors",
    copy: "Turn on GPS, motion, and camera access when your browser allows it. The app falls back to simulation if permissions are blocked.",
  },
  {
    icon: <BrainCircuit size={18} />,
    title: "Run the memory game",
    copy: "Complete the 3x3 recall task in Patient view to log cognitive sessions and compare new performance with prior baselines.",
  },
  {
    icon: <ShieldAlert size={18} />,
    title: "Watch for alerts",
    copy: "The caregiver feed surfaces wandering, dwelling, gait, and ocular risk signals with simple dismissal controls.",
  },
  {
    icon: <Sparkles size={18} />,
    title: "Use the operator dock",
    copy: "The floating dock switches route and gait simulation profiles so you can preview different demo states quickly.",
  },
];

export default function OnboardingGuide({ open, onClose, onBegin }: OnboardingGuideProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center px-3 py-3 md:px-4 md:py-4">
      <button
        type="button"
        aria-label="Close onboarding guide"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="glass relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/12 bg-slate-950/95 shadow-[0_28px_90px_rgba(8,17,26,0.45)] md:max-h-[calc(100vh-2rem)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-cyan via-amber-300 to-signal" />

        <div className="grid min-h-0 gap-0 overflow-y-auto lg:grid-cols-[0.88fr_1.12fr]">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(109,226,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,111,77,0.16),transparent_28%)] p-5 lg:border-b-0 lg:border-r lg:border-white/10 lg:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-300">
              <Sparkles size={14} />
              First-time guide
            </div>
            <h2 className="mt-4 font-display text-2xl leading-tight text-white md:text-[2.1rem]">
              Learn the app in a few minutes, then jump straight into monitoring.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              CogniTrack has two views, shared live sensors, and a floating operator dock. This guide explains the
              path through the page so new users know where to start and what each panel means.
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-3xl border border-white/10 bg-white/6 p-3.5">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Best first action</div>
                <div className="mt-2 text-base font-semibold text-white md:text-lg">Start with Patient view, then switch to Caregiver view.</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Patient view shows the calmer therapy path. Caregiver view exposes the analytics and alert feed.
                </p>
              </div>
              <div className="rounded-3xl border border-cyan/20 bg-cyan/10 p-3.5">
                <div className="text-[11px] uppercase tracking-[0.28em] text-cyan">Shortcuts</div>
                <ul className="mt-2.5 space-y-2 text-sm leading-5 text-slate-200">
                  <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan" />Press Escape to close this guide.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan" />Use the help button in the header to reopen it later.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan" />The operator dock stays in the bottom-right corner.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="p-5 lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">How to use the page</div>
                <h3 className="mt-2 font-display text-xl text-white md:text-2xl">Core features and where to find them</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-white"
                aria-label="Close onboarding guide"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {steps.map((step) => (
                <div key={step.title} className="rounded-3xl border border-white/10 bg-white/6 p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80 text-cyan">
                      {step.icon}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">{step.title}</div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Step guide</div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-sm leading-6 text-slate-300">{step.copy}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(109,226,255,0.12),rgba(8,17,26,0.94))] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan">What to expect next</div>
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-200">
                Once you dismiss this guide, the app will remember your choice. You can still reopen it from the
                header at any time if you want a quick refresher.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onBegin}
                  className="inline-flex items-center gap-2 rounded-2xl bg-cyan px-4 py-2.5 text-sm font-semibold text-ink"
                >
                  Open the app
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}