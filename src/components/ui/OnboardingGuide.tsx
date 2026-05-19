import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Brain,
  CheckCircle2,
  ClipboardList,
  Eye,
  Footprints,
  Gamepad2,
  Home as HomeIcon,
  ImageIcon,
  Info,
  Keyboard,
  Lightbulb,
  Lock,
  MapPinned,
  Phone,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  UserCog,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { cx } from "../../lib/utils";
import type { UserView } from "../../types/app";

import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./Dialog";

// ----------------------------------------------------------------- Page kit

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700 shadow-sm">
      {children}
    </kbd>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-base leading-7 text-slate-700">{children}</p>;
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h3>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2 text-sm leading-6 text-slate-700">
      {items.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-800">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 text-sm leading-6 text-slate-700">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({
  tone = "info",
  icon,
  title,
  children,
}: {
  tone?: "info" | "warn" | "tip";
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "bg-cyan-50 ring-cyan-200 text-cyan-900",
    warn: "bg-amber-50 ring-amber-200 text-amber-900",
    tip: "bg-emerald-50 ring-emerald-200 text-emerald-900",
  } as const;
  const fallback =
    tone === "info" ? <Info size={16} /> : tone === "warn" ? <AlertCircle size={16} /> : <Lightbulb size={16} />;
  return (
    <div className={`mt-3 rounded-2xl ring-1 ${tones[tone]} px-4 py-3 text-sm leading-6`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon ?? fallback}</span>
        <div>
          {title ? <div className="mb-0.5 font-semibold">{title}</div> : null}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

function MetricGrid({ items }: { items: { term: string; def: string }[] }) {
  return (
    <dl className="mt-3 grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.term} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
          <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {it.term}
          </dt>
          <dd className="mt-0.5 text-sm leading-5 text-slate-700">{it.def}</dd>
        </div>
      ))}
    </dl>
  );
}

// ----------------------------------------------------------------- Chapters

type Section = "intro" | "patient" | "caregiver" | "system";

interface Chapter {
  id: string;
  section: Section;
  title: string;
  subtitle: string;
  icon: ComponentType<{ size?: number }>;
  body: ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: "welcome",
    section: "intro",
    title: "Welcome to CogniTrack",
    subtitle: "What this app does and how it's organized",
    icon: Sparkles,
    body: (
      <>
        <Lead>
          CogniTrack is a privacy-first companion app for people living with early-stage
          Alzheimer's and the family or care professionals supporting them. It pairs a
          gentle <strong>Patient view</strong> for daily routines with a richer{" "}
          <strong>Caregiver view</strong> for monitoring, alerts, and screening.
        </Lead>
        <Heading>Two views, one shared brain</Heading>
        <Bullets
          items={[
            <>
              <strong>Patient view</strong> — clear, large-touch interface for everyday use:
              reminders, contacts, photo memories, eye check, memory games.
            </>,
            <>
              <strong>Caregiver view</strong> — live status, geofencing map, gait analysis,
              ocular biomarkers, cognition trends, and ML risk screening.
            </>,
            <>Both views share the same live sensors and the same local data store.</>,
          ]}
        />
        <Heading>Everything runs on your device</Heading>
        <Lead>
          Camera frames, GPS, motion samples, game results, and ML inference all stay
          local. Nothing leaves the browser unless you explicitly share it.
        </Lead>
        <Callout tone="tip" icon={<Keyboard size={16} />} title="Navigating this guide">
          Use the chapter list on the left, the <strong>Next</strong> /{" "}
          <strong>Previous</strong> buttons, or press <Kbd>←</Kbd> / <Kbd>→</Kbd> on
          your keyboard. Press <Kbd>Esc</Kbd> to close.
        </Callout>
      </>
    ),
  },
  {
    id: "first-run",
    section: "intro",
    title: "First-run setup",
    subtitle: "Permissions, presets, and getting your first read",
    icon: CheckCircle2,
    body: (
      <>
        <Lead>
          A few one-time decisions make the rest of the app feel instant. None of these
          steps require an account or an internet connection beyond the initial app load.
        </Lead>
        <Heading>The 5-minute setup</Heading>
        <Steps
          items={[
            <>
              Pick your starting view. Use <strong>Parameters</strong> (bottom-right gear)
              to switch between patient and caregiver any time.
            </>,
            <>
              Open <strong>Manage</strong> in the caregiver view to fill in the patient's
              name, photo, blood type, allergies, and medical notes.
            </>,
            <>
              Add at least one <strong>contact</strong> (one is automatically the
              emergency contact) and a few <strong>reminders</strong> to seed the day.
            </>,
            <>
              Enable sensors as needed: GPS for the map, motion for gait, camera for the
              eye check. Permissions are asked the first time each scene opens.
            </>,
            <>
              Run the <strong>Eye check calibration</strong> once per device — 9-point
              dwell calibration takes ~45 seconds and dramatically improves pursuit
              accuracy.
            </>,
          ]}
        />
        <Callout tone="info" title="Demo mode">
          If you don't have real sensors handy, open Parameters and toggle the{" "}
          <strong>Simulations</strong> on. The app then drives plausible GPS routes and
          motion traces so every scene works end-to-end without hardware.
        </Callout>
      </>
    ),
  },
  {
    id: "patient-home",
    section: "patient",
    title: "Home",
    subtitle: "The patient's daily check-in surface",
    icon: HomeIcon,
    body: (
      <>
        <Lead>
          The Home scene is intentionally minimal: a friendly greeting, the live time,
          today's reminders, the easiest way to call someone, and the recent wins from
          memory games. It's the screen the patient sees most often.
        </Lead>
        <Heading>What you'll see</Heading>
        <MetricGrid
          items={[
            { term: "Greeting strip", def: "Time-of-day greeting + the patient's first name." },
            { term: "Reminders today", def: "Tap to mark done. Dismissed reminders return tomorrow." },
            { term: "Quick contacts", def: "Top three contacts, big call buttons, emergency contact pinned." },
            { term: "Recent wins", def: "Latest memory-game session at a glance." },
            { term: "Health monitoring", def: "GPS / motion / camera switches + a status row." },
            { term: "Status pill", def: "One-line summary of the patient's current state." },
          ]}
        />
        <Heading>Tips for caregivers</Heading>
        <Bullets
          items={[
            "Reminders set in Manage show up here within seconds — no refresh needed.",
            "Add only 3–5 reminders per day. More than that crowds the surface.",
            "The status pill is static — it summarizes patient state without flashing or alarming.",
          ]}
        />
      </>
    ),
  },
  {
    id: "patient-eye",
    section: "patient",
    title: "Eye check & pursuit test",
    subtitle: "Live face mesh, calibration, and oculomotor metrics",
    icon: Eye,
    body: (
      <>
        <Lead>
          Eye movement is one of the earliest places cognitive decline shows up. This
          scene fuses the standard ocular biomarker pipeline with a research-grade{" "}
          <strong>smooth pursuit test</strong>.
        </Lead>
        <Heading>Status row</Heading>
        <Lead>
          Three pill cards show the active state of the camera, the face lock, and the
          calibration. Each card has its own action button (enable, recalibrate, or
          refine).
        </Lead>
        <Heading>Calibration</Heading>
        <Steps
          items={[
            <>
              Tap <strong>Calibrate & start</strong>. Nine targets appear in a 3×3 grid.
            </>,
            <>
              Hold your gaze on each target until the dwell ring fills. Settle time is
              automatic — early frames are discarded.
            </>,
            <>
              Calibration is saved locally for 24 hours. Implicit refinement also runs
              continuously: every click maps gaze→screen so you can <strong>Refine</strong>{" "}
              with N taps.
            </>,
          ]}
        />
        <Heading>The pursuit test</Heading>
        <Lead>
          The cyan target moves on a circular path for 15 seconds at constant angular
          velocity. Follow it with eyes only — keep the head still.
        </Lead>
        <MetricGrid
          items={[
            { term: "Gain", def: "Eye / target velocity ratio. 1.0 is perfect; <0.7 reduced." },
            { term: "Accuracy", def: "100 − mean position error (0–100%)." },
            { term: "Saccade rate", def: "Velocity-spike count per second; lower = smoother pursuit." },
            { term: "Latency", def: "Phase shift between target and eye, in milliseconds." },
          ]}
        />
        <Callout tone="tip" title="Result history">
          Every completed run is saved. The caregiver Vision page plots the gain trend
          across sessions with a healthy reference band.
        </Callout>
      </>
    ),
  },
  {
    id: "patient-games",
    section: "patient",
    title: "Memory games",
    subtitle: "Three short exercises for a personal cognition baseline",
    icon: Gamepad2,
    body: (
      <>
        <Lead>
          Each game emits memory span and reaction-time samples that the caregiver
          Cognition page tracks across days.
        </Lead>
        <Heading>What's in the gallery</Heading>
        <Bullets
          items={[
            <>
              <strong>Quick play</strong> — featured exercise. Updates daily.
            </>,
            <>
              <strong>Puzzles</strong> — Simon (sequence recall), pattern ladder, target
              scan.
            </>,
            <>
              <strong>Brain teasers</strong> — bubble pop (ascending order), reaction
              light, alternating reasoning.
            </>,
          ]}
        />
        <Heading>How scoring works</Heading>
        <Lead>
          Memory span is the longest sequence the patient can reproduce. Reaction time is
          a rolling median across the session, ignoring the first two trials (warm-up).
          Decline alerts compare new sessions against the patient's rolling 10-session
          baseline.
        </Lead>
      </>
    ),
  },
  {
    id: "patient-people",
    section: "patient",
    title: "People",
    subtitle: "Big call buttons, emergency contact pinned",
    icon: Users,
    body: (
      <>
        <Lead>
          Family and care team in one place — designed so anyone can place a call without
          remembering numbers. Whoever is marked emergency contact in Manage gets pinned
          to the top with a red accent.
        </Lead>
        <Heading>Calling someone</Heading>
        <Steps
          items={[
            <>
              Tap the contact card.
            </>,
            <>
              The system phone dialer opens with their number prefilled (using the{" "}
              <code>tel:</code> URL scheme). On desktop, this hands off to your default
              calling app.
            </>,
            <>
              Edit names, photos, and numbers from the caregiver Manage page.
            </>,
          ]}
        />
        <Callout tone="info" icon={<Phone size={16} />}>
          The emergency contact is always at the top, regardless of the order in Manage.
        </Callout>
      </>
    ),
  },
  {
    id: "patient-memories",
    section: "patient",
    title: "Memories",
    subtitle: "Familiar faces and captioned moments",
    icon: ImageIcon,
    body: (
      <>
        <Lead>
          A grid of photos curated by the caregiver, each with a short caption — a child's
          name, a favorite place, an old job. Tap a photo to expand it. The grid is
          stored locally; nothing is uploaded.
        </Lead>
        <Heading>Caregiver workflow</Heading>
        <Steps
          items={[
            <>Open Manage → Memories.</>,
            <>Add photos via the file picker. Photos are stored as data URLs in localStorage.</>,
            <>Write a caption: who, when, where. Avoid long stories.</>,
            <>The Memories tab in the patient view updates immediately.</>,
          ]}
        />
        <Callout tone="warn" title="Storage limits">
          localStorage has a soft cap of about 5 MB per origin. Keep memory photos
          modest (under ~150 KB each) or you'll start hitting quota errors.
        </Callout>
      </>
    ),
  },
  {
    id: "patient-profile",
    section: "patient",
    title: "Profile",
    subtitle: "Personal details the patient and ER staff can see",
    icon: User,
    body: (
      <>
        <Lead>
          The patient profile is the read-only mirror of what's in Manage: name, photo,
          date of birth, blood type, allergies, home address, and medical notes.
        </Lead>
        <Heading>Why it's here</Heading>
        <Lead>
          If the patient hands their phone to a paramedic or a confused passerby, this
          page gives the essential medical context at a glance. It's intentionally
          read-only on the patient side so it can't be edited by accident.
        </Lead>
      </>
    ),
  },
  {
    id: "caregiver-overview",
    section: "caregiver",
    title: "Overview",
    subtitle: "The caregiver landing page",
    icon: HomeIcon,
    body: (
      <>
        <Lead>
          The first scene caregivers land on. Top to bottom: patient header with photo,
          sensor status grid, sensor-enable controls, four metric tiles that drill into
          detail pages, full status board, and a recent-activity preview.
        </Lead>
        <Heading>Metric tiles</Heading>
        <MetricGrid
          items={[
            { term: "Location", def: "Distance from safe-zone home, with current scenario name." },
            { term: "Gait", def: "Live classification (normal / shuffle / unsteady / fall) + risk %." },
            { term: "Vision", def: "Ocular risk (Low / Moderate / High) + blink rate." },
            { term: "Cognition", def: "Latest memory span + total stored sessions." },
          ]}
        />
        <Callout tone="tip">
          Each tile is a button — tap to jump straight to its detail page.
        </Callout>
      </>
    ),
  },
  {
    id: "caregiver-map",
    section: "caregiver",
    title: "Map",
    subtitle: "Wandering, geofencing, dwelling",
    icon: MapPinned,
    body: (
      <>
        <Lead>
          A live map (OpenStreetMap tiles) of the patient's GPS trail. A draggable safe
          zone with an adjustable radius. Three detection algorithms run in parallel and
          fire alerts on the Alerts page.
        </Lead>
        <Heading>Detectors</Heading>
        <Bullets
          items={[
            <><strong>Geofence breach</strong> — patient leaves the radius around the safe-zone center.</>,
            <><strong>Dwelling</strong> — patient is stationary in an unusual location for too long.</>,
            <><strong>Pacing</strong> — back-and-forth walking pattern indicating confusion.</>,
          ]}
        />
        <Callout tone="info">
          Drag the marker to set the safe-zone center, then use the slider to tune the
          radius. Changes save locally and persist across sessions.
        </Callout>
      </>
    ),
  },
  {
    id: "caregiver-alerts",
    section: "caregiver",
    title: "Alerts",
    subtitle: "Notification feed",
    icon: Bell,
    body: (
      <>
        <Lead>
          Every anomaly the app detects — geofence breach, dwelling, pacing, fall, vision
          spike, cognition decline — lands here. The bell badge in the header shows the
          unread count.
        </Lead>
        <Heading>Managing alerts</Heading>
        <Bullets
          items={[
            "Tap an alert to mark it read.",
            <><strong>Dismiss</strong> removes one. <strong>Clear all</strong> empties the feed.</>,
            "Alert state is local — there is no server.",
          ]}
        />
      </>
    ),
  },
  {
    id: "caregiver-gait",
    section: "caregiver",
    title: "Gait",
    subtitle: "Fall detection and stability classification",
    icon: Footprints,
    body: (
      <>
        <Lead>
          Reads the device's accelerometer + gyroscope and runs a small classifier over
          a rolling window. The live waveform shows the magnitude of acceleration; the
          variance and step-cadence breakouts tell you why the model decided what it did.
        </Lead>
        <Heading>Classes</Heading>
        <MetricGrid
          items={[
            { term: "Normal", def: "Stable rhythmic gait." },
            { term: "Shuffle", def: "Reduced amplitude + low variance." },
            { term: "Unsteady", def: "High variance, irregular cadence." },
            { term: "Fall detected", def: "Sharp acceleration spike + post-event quiet." },
          ]}
        />
        <Callout tone="warn" icon={<AlertCircle size={16} />}>
          On desktop without motion sensors, enable the simulation in Parameters to see
          the pipeline in action.
        </Callout>
      </>
    ),
  },
  {
    id: "caregiver-vision",
    section: "caregiver",
    title: "Vision",
    subtitle: "Ocular biomarkers and pursuit history",
    icon: Eye,
    body: (
      <>
        <Lead>
          The caregiver mirror of the patient Eye check. Hero card shows current ocular
          risk; live mesh sits beside a 6-cell status board (tracker, face lock, ocular
          risk, blink rate, fixation, pursuit-run count).
        </Lead>
        <Heading>Pursuit gain trend</Heading>
        <Lead>
          The most discriminating clinical metric for this app. The mini-chart plots the
          last 10 sessions, with a healthy reference band (gain 0.85–1.15) shaded in
          green and points colored by per-session risk.
        </Lead>
        <Heading>What to watch</Heading>
        <Bullets
          items={[
            "Single low-gain session: probably a bad calibration day.",
            "Three consecutive sessions below 0.7: clinically meaningful trend.",
            "Saccade rate climbing while gain falls: anti-saccade-style impairment.",
          ]}
        />
      </>
    ),
  },
  {
    id: "caregiver-trends",
    section: "caregiver",
    title: "Cognition",
    subtitle: "Memory + reaction time over time",
    icon: Brain,
    body: (
      <>
        <Lead>
          A pair of mini-charts showing memory span and reaction time across all stored
          game sessions, with rolling baselines for decline detection.
        </Lead>
        <Heading>Decline detection</Heading>
        <Lead>
          Each new session is compared against the rolling 10-session baseline. A
          significant drop (memory span below baseline mean − 1 SD, or reaction time
          above mean + 1 SD) raises a cognition alert.
        </Lead>
      </>
    ),
  },
  {
    id: "caregiver-screening",
    section: "caregiver",
    title: "Screening",
    subtitle: "Four ML risk models running in your browser",
    icon: ClipboardList,
    body: (
      <>
        <Lead>
          Bundled ML models that run locally via ONNX Runtime Web — no backend, no data
          ever leaves the device. Each tab has its own input pane appropriate to its
          model.
        </Lead>
        <Heading>The four tabs</Heading>
        <Bullets
          items={[
            <>
              <strong>Clinical questionnaire</strong> — 32-feature gradient boosting
              classifier, AUC 0.95. Fill in demographics, lifestyle, comorbidities,
              vitals, and observed cognitive symptoms.
            </>,
            <>
              <strong>OASIS / brain volumes</strong> — 10-feature classifier, AUC 0.89.
              Includes 3 MRI-derived volume metrics (eTIV, nWBV, ASF) with
              population-median defaults.
            </>,
            <>
              <strong>Daily agitation forecast</strong> — 41-feature classifier,
              GroupKFold AUC 0.78 (no patient leakage). Use the day-profile presets to
              populate plausible values, then tweak.
            </>,
            <>
              <strong>MRI image</strong> — 4-class CNN-style pipeline, 78% test acc.
              Drop in any axial brain MRI image; the preview shows exactly what the
              model sees.
            </>,
          ]}
        />
        <Callout tone="warn" title="Educational tools, not diagnoses">
          These models are demos trained on small public datasets. They are not approved
          medical devices and should not drive clinical decisions.
        </Callout>
      </>
    ),
  },
  {
    id: "caregiver-manage",
    section: "caregiver",
    title: "Manage",
    subtitle: "Profile, contacts, reminders, memories",
    icon: UserCog,
    body: (
      <>
        <Lead>
          The caregiver's edit surface. Everything here is mirrored to the patient view
          immediately. Four sections, each independent:
        </Lead>
        <Bullets
          items={[
            <><strong>Profile</strong> — name, photo, DOB, blood type, allergies, home address, medical notes.</>,
            <><strong>Contacts</strong> — add/remove, mark one as the emergency contact.</>,
            <><strong>Reminders</strong> — daily routine items the patient can mark done.</>,
            <><strong>Memories</strong> — captioned photos for the Memories tab.</>,
          ]}
        />
        <Callout tone="tip">
          All changes save to localStorage on every keystroke — no Save button needed.
        </Callout>
      </>
    ),
  },
  {
    id: "system-parameters",
    section: "system",
    title: "Parameters & demo controls",
    subtitle: "View switching, simulations, reset",
    icon: Target,
    body: (
      <>
        <Lead>
          The gear icon in the bottom-right opens Parameters — the one place to switch
          between patient and caregiver, override sensor scenarios, and reset all local
          data.
        </Lead>
        <Heading>What's in there</Heading>
        <Bullets
          items={[
            <><strong>View mode</strong> — Patient / Caregiver toggle.</>,
            <><strong>Simulations</strong> — when on, the app drives plausible GPS routes and motion samples without real sensors. Off by default; sensors stay idle until you grant permission per scene.</>,
            <><strong>Location scenario</strong> — pick from typical-day / lost / dwelling profiles when simulations are on.</>,
            <><strong>Voice prompts</strong> — toggle text-to-speech for reminders.</>,
            <><strong>Reset all data</strong> — wipes localStorage. Use carefully — it removes profile, contacts, reminders, memories, calibration, and history.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "system-privacy",
    section: "system",
    title: "Privacy & data",
    subtitle: "Where everything lives and what crosses the network",
    icon: Lock,
    body: (
      <>
        <Lead>
          CogniTrack is built around the principle that sensitive data should never leave
          the device unless the user explicitly says so.
        </Lead>
        <Heading>What's local</Heading>
        <Bullets
          items={[
            "Profile, contacts, reminders, memories — localStorage.",
            "Calibration model + click-stream samples — localStorage.",
            "Game session history, alerts, pursuit results — localStorage.",
            "Camera frames — processed in-browser by MediaPipe; never sent anywhere.",
            "GPS / motion samples — used in-memory; not persisted by default.",
            "ML model inference — runs in WebAssembly via ONNX Runtime Web.",
          ]}
        />
        <Heading>What does cross the network</Heading>
        <Bullets
          items={[
            "Initial app load (HTML, JS, CSS, ONNX model files).",
            "OpenStreetMap tile fetches (the map).",
            "MediaPipe model file (face mesh) — fetched on first eye-check open.",
            "ONNX Runtime WASM bytecode — fetched once and PWA-cached.",
          ]}
        />
        <Callout tone="info">
          The app works offline after the first load — service worker precaches the JS,
          CSS, ONNX models, and recent map tiles.
        </Callout>
      </>
    ),
  },
  {
    id: "system-shortcuts",
    section: "system",
    title: "Shortcuts & accessibility",
    subtitle: "Keys, tap targets, and reduced-motion support",
    icon: Keyboard,
    body: (
      <>
        <Lead>
          The app is built mobile-first but works on desktop too. A few shortcuts and
          accessibility notes.
        </Lead>
        <Heading>Keyboard</Heading>
        <Bullets
          items={[
            <><Kbd>Esc</Kbd> — close any modal (this guide, Parameters, dialogs).</>,
            <><Kbd>Tab</Kbd> / <Kbd>Shift+Tab</Kbd> — move focus through the active scene.</>,
            <>In this guide: <Kbd>←</Kbd> / <Kbd>→</Kbd> for previous / next chapter.</>,
          ]}
        />
        <Heading>Touch targets</Heading>
        <Lead>
          Every button on the patient view is at least 44×44 px to comply with mobile
          accessibility guidelines. Bottom nav is icon-only on small screens with a label
          per icon read by screen readers.
        </Lead>
        <Heading>Reduced motion</Heading>
        <Lead>
          Framer-motion animations respect <code>prefers-reduced-motion</code> at the OS
          level. Cards still appear but spring transitions are dampened.
        </Lead>
      </>
    ),
  },
];

const SECTION_LABELS: Record<Section, string> = {
  intro: "Getting started",
  patient: "Patient view",
  caregiver: "Caregiver view",
  system: "System",
};

const SECTION_ORDER: Section[] = ["intro", "patient", "caregiver", "system"];

// ----------------------------------------------------------------- Component

interface OnboardingGuideProps {
  open: boolean;
  currentView: UserView;
  onClose: () => void;
}

export default function OnboardingGuide({
  open,
  currentView,
  onClose,
}: OnboardingGuideProps) {
  // Role-aware chapter set. We always show intro + system chapters and the
  // chapters that match the user's view; the other role's chapters are
  // dropped entirely so the guide stays relevant.
  const chapters = useMemo(
    () =>
      CHAPTERS.filter(
        (c) => c.section === "intro" || c.section === "system" || c.section === currentView,
      ),
    [currentView],
  );

  const defaultId = currentView === "caregiver" ? "caregiver-overview" : "patient-home";
  const [activeId, setActiveId] = useState<string>(defaultId);
  useEffect(() => {
    if (open) setActiveId(defaultId);
  }, [open, defaultId]);

  const activeIndex = useMemo(
    () => Math.max(0, chapters.findIndex((c) => c.id === activeId)),
    [activeId, chapters],
  );
  const chapter = chapters[activeIndex] ?? chapters[0];

  const goPrev = useCallback(() => {
    setActiveId(chapters[Math.max(0, activeIndex - 1)]!.id);
  }, [activeIndex, chapters]);
  const goNext = useCallback(() => {
    setActiveId(chapters[Math.min(chapters.length - 1, activeIndex + 1)]!.id);
  }, [activeIndex, chapters]);

  // Keyboard shortcuts for previous / next chapter
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  // Scroll the content area to top when the chapter changes
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeId]);

  if (!chapter) return null;
  const Icon = chapter.icon;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showClose
        closeLabel="Close user guide"
        // Inline style because cx() doesn't tailwind-merge: the base
        // DialogContent uses `w-full max-w-2xl`, which wins against an
        // arbitrary-value `w-[...]` utility at the className layer.
        style={{
          width: "min(96vw, 960px)",
          height: "min(88vh, 820px)",
          maxWidth: "none",
        }}
        className="flex flex-col gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <DialogTitle className="font-display text-base font-semibold text-slate-900">
              CogniTrack user guide
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Chapter {activeIndex + 1} of {chapters.length} · {SECTION_LABELS[chapter.section]}
            </DialogDescription>
          </div>
        </header>

        {/* Body: sidebar + content */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-slate-200">
            <ChapterListMobile
              chapters={chapters}
              activeId={activeId}
              onSelect={setActiveId}
            />
            <ChapterListDesktop
              chapters={chapters}
              activeId={activeId}
              onSelect={setActiveId}
            />
          </aside>

          <main className="flex min-h-0 flex-1 flex-col">
            <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
              <AnimatePresence mode="wait">
                <motion.article
                  key={chapter.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                      <Icon size={22} />
                    </span>
                    <div>
                      <h2 className="font-display text-2xl font-semibold leading-tight text-slate-900">
                        {chapter.title}
                      </h2>
                      <p className="text-sm text-slate-600">{chapter.subtitle}</p>
                    </div>
                  </div>
                  <div className="max-w-2xl">{chapter.body}</div>
                </motion.article>
              </AnimatePresence>
            </div>

            {/* Footer / pagination */}
            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 sm:px-6">
              <Button
                variant="secondary"
                icon={<ArrowLeft size={14} />}
                onClick={goPrev}
                disabled={activeIndex === 0}
              >
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <div className="hidden items-center gap-1.5 sm:flex">
                {chapters.map((c, i) => (
                  <span
                    key={c.id}
                    aria-hidden
                    className={cx(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      i === activeIndex ? "bg-cyan-600" : "bg-slate-300",
                    )}
                  />
                ))}
              </div>
              {activeIndex === chapters.length - 1 ? (
                <Button variant="primary" onClick={onClose}>
                  Done
                </Button>
              ) : (
                <Button
                  variant="primary"
                  iconRight={<ArrowRight size={14} />}
                  onClick={goNext}
                >
                  Next
                </Button>
              )}
            </footer>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Chapter list

function ChapterListDesktop({
  chapters,
  activeId,
  onSelect,
}: {
  chapters: Chapter[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Guide chapters" className="hidden md:block md:py-4">
      {SECTION_ORDER.map((section) => {
        const items = chapters.filter((c) => c.section === section);
        if (items.length === 0) return null;
        return (
          <div key={section} className="mb-3">
            <p className="px-5 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {SECTION_LABELS[section]}
            </p>
            <ul>
              {items.map((c) => {
                const Icon = c.icon;
                const isActive = c.id === activeId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={cx(
                        "relative flex w-full items-center gap-2 px-5 py-2 text-left text-sm transition",
                        isActive
                          ? "bg-cyan-50 font-semibold text-cyan-800"
                          : "text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {isActive ? (
                        <motion.span
                          layoutId="guide-active-bar"
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-cyan-600"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      ) : null}
                      <Icon size={14} />
                      <span className="truncate">{c.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ChapterListMobile({
  chapters,
  activeId,
  onSelect,
}: {
  chapters: Chapter[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border-b border-slate-200 p-3 md:hidden">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
        Chapter
        <select
          value={activeId}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        >
          {SECTION_ORDER.map((section) => {
            const items = chapters.filter((c) => c.section === section);
            if (items.length === 0) return null;
            return (
              <optgroup key={section} label={SECTION_LABELS[section]}>
                {items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
    </div>
  );
}
