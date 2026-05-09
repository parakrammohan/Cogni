import {
  Activity,
  ArrowRight,
  Brain,
  Camera,
  CheckCircle2,
  Eye,
  ImageIcon,
  MapPinned,
  Settings2,
  ShieldCheck,
  Sparkles,
  User,
  Users,
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
    icon: <Sparkles size={16} />,
    title: "Home — your day, simply",
    copy: "Live clock, today's reminders, quick contacts, recent wins. Tap any reminder to mark it done.",
  },
  {
    icon: <Eye size={16} />,
    title: "Eye check",
    copy: "Allow the camera and we'll run a real-time face mesh. EAR, blink rate, fixation — all explained on screen.",
  },
  {
    icon: <Brain size={16} />,
    title: "Memory games",
    copy: "Three short exercises (sequence recall, pattern ladder, target scan) build a personal baseline over time.",
  },
  {
    icon: <Users size={16} />,
    title: "People",
    copy: "Family and care team in one place — big call buttons, emergency contact at the top.",
  },
  {
    icon: <ImageIcon size={16} />,
    title: "Memories",
    copy: "Captioned photos curated by your caregiver. A familiar face is one tap away.",
  },
  {
    icon: <User size={16} />,
    title: "Profile",
    copy: "Personal info, blood type, allergies, medical notes. Your caregiver keeps this updated.",
  },
];

const CAREGIVER_STEPS: Step[] = [
  {
    icon: <Sparkles size={16} />,
    title: "Overview",
    copy: "Patient header, sensor status, quick metric tiles that jump to detail. Recent activity preview at the bottom.",
  },
  {
    icon: <MapPinned size={16} />,
    title: "Map",
    copy: "Drag the marker on the map and tune the radius slider. Geofence, dwelling, and pacing detectors run continuously.",
  },
  {
    icon: <Activity size={16} />,
    title: "Gait",
    copy: "Live waveform plus an explicit fall-signature classifier. Variance signals broken out per axis.",
  },
  {
    icon: <Eye size={16} />,
    title: "Ocular biomarkers",
    copy: "Both pipelines in one place — live eye check, plus history of pursuit-test sessions with gain, saccade rate, and phase-shift latency.",
  },
  {
    icon: <Brain size={16} />,
    title: "Cognition",
    copy: "Memory span and reaction time across the patient's sessions. Decline alerts compare new sessions against the rolling baseline.",
  },
  {
    icon: <ShieldCheck size={16} />,
    title: "Manage",
    copy: "Edit the patient profile, contacts, daily reminders, and photo memories. Changes surface immediately in the patient view.",
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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showClose closeLabel="Close onboarding guide" className="max-w-3xl gap-5">
        <header className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <Sparkles size={14} aria-hidden />
            {isPatient ? "Patient guide" : "Caregiver guide"}
          </div>
          <DialogTitle className="font-display text-2xl font-semibold leading-tight text-slate-900">
            Welcome to CogniTrack
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            CogniTrack has two surfaces sharing the same live sensors. The{" "}
            <strong>{isPatient ? "patient" : "caregiver"}</strong> view you&apos;re in now is
            organized by the left sidebar (or the bottom nav on mobile). Switching between views
            and adjusting demo simulations lives in <strong>Parameters</strong> at the bottom
            right.
          </DialogDescription>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <ul className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <li className="flex items-start gap-2">
              <Settings2 size={16} className="mt-0.5 shrink-0 text-cyan-700" aria-hidden />
              <span>
                <strong>Parameters</strong> button (bottom-right) — switch view mode, override
                simulated sensor scenarios, or reset all local data.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Camera size={16} className="mt-0.5 shrink-0 text-cyan-700" aria-hidden />
              <span>
                <strong>Camera, GPS, motion</strong> all run client-side. Permissions are asked
                only when you start the relevant scene.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-700" aria-hidden />
              <span>
                Press <kbd className="rounded border border-slate-300 bg-white px-1.5 text-xs">Esc</kbd> to close
                this guide. Reopen any time from the sidebar footer.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-700" aria-hidden />
              <span>
                The bell in the top bar opens{" "}
                {isPatient
                  ? "your task notifications (reminders, recent wins)."
                  : "the alerts feed."}
              </span>
            </li>
          </ul>
        </aside>

        <footer className="flex flex-wrap items-center gap-3">
          <Button variant="primary" iconRight={<ArrowRight size={16} />} onClick={onClose}>
            Open the app
          </Button>
          <Button
            variant="secondary"
            icon={isPatient ? <ShieldCheck size={16} /> : <User size={16} />}
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
