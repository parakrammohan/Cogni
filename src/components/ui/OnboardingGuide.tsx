import {
  Activity,
  ArrowRight,
  Brain,
  Camera,
  CheckCircle2,
  MapPinned,
  Sparkles,
  User,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./Dialog";
import { Button } from "./Button";
import type { UserView } from "../../types/app";

interface OnboardingGuideProps {
  open: boolean;
  currentView: UserView;
  onClose: () => void;
  onSwitchView: (view: UserView) => void;
}

interface Step {
  icon: ReactNode;
  title: string;
  copy: string;
}

const PATIENT_STEPS: Step[] = [
  {
    icon: <Activity size={16} />,
    title: "Live dashboard",
    copy: "See your route status, gait stability, and ocular screening at a glance — calm, low-friction copy.",
  },
  {
    icon: <Camera size={16} />,
    title: "Ocular screening",
    copy: "Allow the camera to run a real-time face mesh that measures blink rate and gaze stability.",
  },
  {
    icon: <Brain size={16} />,
    title: "Cognitive exercises",
    copy: "Three short games — sequence recall, pattern reasoning, and visual search — log a baseline over time.",
  },
];

const CAREGIVER_STEPS: Step[] = [
  {
    icon: <MapPinned size={16} />,
    title: "Safe-zone monitor",
    copy: "Drag the marker on the map or use the radius slider to define the perimeter the alerts engine watches.",
  },
  {
    icon: <Activity size={16} />,
    title: "Gait & fall analysis",
    copy: "Live waveform of motion samples plus an explicit fall-signature classifier with risk breakdown.",
  },
  {
    icon: <Brain size={16} />,
    title: "Cognitive trends",
    copy: "Memory span and reaction time charted across the patient's stored sessions.",
  },
];

export default function OnboardingGuide({
  open,
  currentView,
  onClose,
  onSwitchView,
}: OnboardingGuideProps) {
  const isPatient = currentView === "patient";
  const steps = isPatient ? PATIENT_STEPS : CAREGIVER_STEPS;
  const otherView = isPatient ? "caregiver" : "patient";
  const otherIcon = isPatient ? <ShieldCheck size={14} /> : <User size={14} />;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showClose closeLabel="Close onboarding guide">
        <header className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <Sparkles size={14} aria-hidden />
            First-time guide
          </div>
          <DialogTitle className="font-display text-2xl font-semibold leading-tight text-slate-900">
            Welcome to CogniTrack
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            CogniTrack is a browser-based Alzheimer&apos;s detection and care concept. The patient
            view is calm and guided; the caregiver view exposes the diagnostic detail. Both share
            the same live sensors.
          </DialogDescription>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <article
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white"
            >
              <div className="flex items-center gap-2 text-cyan-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                  {step.icon}
                </span>
                <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.copy}</p>
            </article>
          ))}
        </section>

        <aside className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4">
          <ul className="grid gap-2 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-700" aria-hidden />
              <span>Press <kbd className="rounded border border-slate-300 bg-white px-1.5 text-xs">Esc</kbd> to close this guide at any time.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-700" aria-hidden />
              <span>The Guide button in the header reopens this dialog later.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-700" aria-hidden />
              <span>The demo simulator (bottom-right) lets you preview wandering, fall, and dwelling scenarios.</span>
            </li>
          </ul>
        </aside>

        <footer className="flex flex-wrap items-center gap-3">
          <Button variant="primary" iconRight={<ArrowRight size={16} />} onClick={onClose}>
            Open the app
          </Button>
          <Button
            variant="secondary"
            icon={otherIcon}
            onClick={() => {
              onSwitchView(otherView);
              onClose();
            }}
          >
            Switch to {otherView} view
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
