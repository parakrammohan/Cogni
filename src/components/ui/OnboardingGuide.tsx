import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Brain,
  ClipboardList,
  Eye,
  Footprints,
  Gamepad2,
  Globe,
  Home as HomeIcon,
  ImageIcon,
  Info,
  KeyRound,
  Keyboard,
  Lightbulb,
  Lock,
  MapPinned,
  Phone,
  Radio,
  Sparkles,
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./Dialog";

// ----------------------------------------------------------------- Page kit
import { useTranslation } from "react-i18next";
function Kbd({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700 shadow-sm">
      {children}
    </kbd>
  );
}
function Lead({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <p className="text-base leading-7 text-slate-700">{children}</p>;
}
function Heading({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h3>
  );
}
function Steps({ items }: { items: ReactNode[] }) {
  const { t } = useTranslation();
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
  const { t } = useTranslation();
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
  const { t } = useTranslation();
  const tones = {
    info: "bg-cyan-50 ring-cyan-200 text-cyan-900",
    warn: "bg-amber-50 ring-amber-200 text-amber-900",
    tip: "bg-emerald-50 ring-emerald-200 text-emerald-900",
  } as const;
  const fallback =
    tone === "info" ? (
      <Info size={16} />
    ) : tone === "warn" ? (
      <AlertCircle size={16} />
    ) : (
      <Lightbulb size={16} />
    );
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
function MetricGrid({
  items,
}: {
  items: {
    term: string;
    def: string;
  }[];
}) {
  const { t } = useTranslation();
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
  icon: ComponentType<{
    size?: number;
  }>;
  body: ReactNode;
}
const CHAPTERS: Chapter[] = [
  // ============================ INTRO ============================
  {
    id: "welcome",
    section: "intro",
    title: "Welcome to Cogni",
    subtitle: "What this app does and how it's organised",
    icon: Sparkles,
    body: (
      <>
        <Lead>
          Cogni is a companion app for people living with early-stage Alzheimer's and the family or
          care professionals supporting them. The patient sees a gentle daily-routine app; the
          paired caregiver sees the same household through a richer monitoring + screening lens.
        </Lead>
        <Heading>Two views, one paired account</Heading>
        <Bullets
          items={[
            <>
              <strong>Patient view</strong> — clear, large-touch surface for the day: home greeting,
              reminders, contacts, photo memories, eye-check, memory games.
            </>,
            <>
              <strong>Caregiver view</strong> — live patient status, geofencing map, gait analysis,
              ocular biomarkers, cognition trends, and four ML risk-screening models.
            </>,
            <>
              The two views run on separate devices. They share data over a live WebSocket once
              paired (see the <em>Live link</em> chapter).
            </>,
          ]}
        />
        <Heading>What's running where</Heading>
        <Lead>
          The app is a Vercel-hosted SPA backed by a FastAPI service on Hugging Face Spaces and an
          Aiven Postgres database. Camera / GPS / motion processing stays on the device; PII (name,
          allergies, addresses, contacts) is encrypted at-rest in the database with Fernet; ML
          inference runs server-side. The privacy chapter has the full breakdown.
        </Lead>
        <Callout tone="tip" icon={<Keyboard size={16} />} title="Navigating this guide">
          Use the chapter list on the left, the <strong>Next</strong> / <strong>Previous</strong>{" "}
          buttons, or press <Kbd>←</Kbd> / <Kbd>→</Kbd>. Press <Kbd>Esc</Kbd> to close.
        </Callout>
      </>
    ),
  },
  {
    id: "accounts-pairing",
    section: "intro",
    title: "Accounts & pairing",
    subtitle: "Sign up, sign in, link a caregiver to a patient",
    icon: KeyRound,
    body: (
      <>
        <Lead>
          Every Cogni user has an account. Roles (Patient or Caregiver) are chosen at signup and
          decide which view the app loads. Pairing links exactly one caregiver to one patient so the
          live monitoring feed knows where to go.
        </Lead>
        <Heading>Creating an account</Heading>
        <Steps
          items={[
            <>
              Open the app — anyone not signed in lands on the sign-in screen with a Sign up link.
            </>,
            <>
              Pick <strong>Patient</strong> or <strong>Caregiver</strong>. Pick a username
              (lowercase, dashes / underscores OK) and a password of at least 8 characters.
            </>,
            <>
              <strong>Optional:</strong> paste a pairing code if your caregiver / patient already
              sent one. You'll be linked the moment the account is created.
            </>,
          ]}
        />
        <Heading>Pairing afterwards</Heading>
        <Steps
          items={[
            <>
              On <strong>either</strong> side, open the Profile scene's pairing card and tap{" "}
              <strong>Generate code</strong>. A 6-character code (alphanumeric, no confusable
              characters) appears with a 15-minute countdown.
            </>,
            <>
              Share the code with the other side over whatever channel you use (in person, phone
              call, message).
            </>,
            <>
              The receiver opens their own pairing card, taps <strong>Enter code</strong>, types it
              in. Codes are case-insensitive and single-use.
            </>,
            <>
              Done. The caregiver dashboard now sees the paired patient on Overview, Vision, Gait,
              Map, etc.
            </>,
          ]}
        />
        <Heading>Demo accounts</Heading>
        <Lead>Two seeded accounts work without signup for judges / demos:</Lead>
        <Bullets
          items={[
            <>
              <code>demo-caregiver</code> · <code>demo-pass-1234</code>
            </>,
            <>
              <code>demo-patient</code> · <code>demo-pass-1234</code>
            </>,
            <>
              They're auto-paired on every backend boot, so you can sign in on two devices and see
              the live link immediately.
            </>,
          ]}
        />
        <Callout tone="info" icon={<Lock size={16} />} title="Account safety">
          Sessions are opaque server-side tokens stored in an HttpOnly + Secure cookie. There's no
          token for JavaScript to leak. Logging out (or deleting your account) revokes the cookie on
          this device and clears every cached query. Change password from Account settings — it also
          signs you out of every other device.
        </Callout>
      </>
    ),
  },
  {
    id: "language",
    section: "intro",
    title: "Language",
    subtitle: "English, 中文, Bahasa Melayu, தமிழ்",
    icon: Globe,
    body: (
      <>
        <Lead>
          Cogni ships in Singapore's four official languages. The patient and caregiver views, the
          sign-in screen, and most everyday UI are translated end-to-end.
        </Lead>
        <Heading>Where to switch</Heading>
        <Bullets
          items={[
            <>
              <strong>Sign-in screen</strong> — a four-pill picker above the form. Each pill is
              labelled in its own script (English / 中文 / Bahasa Melayu / தமிழ்), so a user landing
              in the wrong language can always read their way out.
            </>,
            <>
              <strong>Top-right account menu</strong> — same picker, available from every scene once
              you're signed in.
            </>,
            <>
              <strong>Profile → Account settings</strong> — same picker again. Use whichever is
              closest.
            </>,
          ]}
        />
        <Heading>How it behaves</Heading>
        <Bullets
          items={[
            "Your choice is saved in this device's localStorage; reloads keep it.",
            "On first visit with no saved choice, the app picks from `navigator.language` — Chinese / Malay / Tamil browsers land in their own language, everyone else lands on English.",
            "Switching is instant — no reload, no relogin.",
          ]}
        />
        <Callout tone="info">
          A few long-tail screens (admin dashboard, parts of caregiver Manage) are still English
          only. Those scenes fall back to English literals; nothing breaks if a key isn't translated
          yet.
        </Callout>
      </>
    ),
  },

  // ============================ PATIENT ============================
  {
    id: "patient-home",
    section: "patient",
    title: "Home",
    subtitle: "The patient's daily check-in surface",
    icon: HomeIcon,
    body: (
      <>
        <Lead>
          Intentionally minimal: a time-of-day greeting, today's reminders, quick-call buttons for a
          few key contacts, and a short recap of recent memory-game wins. This is the screen the
          patient sees most often.
        </Lead>
        <Heading>What you'll see</Heading>
        <MetricGrid
          items={[
            { term: "Greeting strip", def: "Time-of-day greeting + your preferred name." },
            { term: "Reminders today", def: "Tap to mark done. Recurring items return tomorrow." },
            {
              term: "Quick contacts",
              def: "Top contacts with big call buttons; emergency pinned.",
            },
            { term: "Recent wins", def: "Latest memory-game and pursuit results in one card." },
            {
              term: "Status pill",
              def: "Calm one-line summary — 'Steady', 'High fall risk', etc.",
            },
          ]}
        />
        <Heading>What controls what</Heading>
        <Bullets
          items={[
            "Reminders come from Manage (caregiver) or directly from Profile → Reminders.",
            "Contacts come from People — both patient and caregiver can add / edit them.",
            "Status pill summarises the latest gait + location signals; it never flashes or alarms.",
            "Live link badge in the top bar shows whether the WebSocket to the caregiver is healthy.",
          ]}
        />
      </>
    ),
  },
  {
    id: "patient-eye",
    section: "patient",
    title: "Eye check",
    subtitle: "Live face mesh + a 15-second smooth-pursuit test",
    icon: Eye,
    body: (
      <>
        <Lead>
          Eye movement is one of the earliest places cognitive decline shows up. This scene fuses a
          live face mesh (blink rate, fixation, gaze) with a research-grade{" "}
          <strong>smooth pursuit</strong> test.
        </Lead>
        <Heading>Calibration (one-time per device)</Heading>
        <Steps
          items={[
            <>
              Tap <strong>Calibrate & start</strong>. Nine targets appear in a 3×3 grid.
            </>,
            <>
              Hold your gaze on each target until the dwell ring fills (~3 seconds). Early frames
              are discarded.
            </>,
            <>
              Calibration is stored in this device's localStorage. Every click in the app also feeds
              an implicit refinement pool — you can <strong>Refine</strong> after a few minutes of
              use without redoing the 9-point dance.
            </>,
          ]}
        />
        <Heading>The pursuit test</Heading>
        <Lead>
          A cyan target moves in a slow circular path for 15 seconds. Follow it with eyes only —
          keep the head still. The screen displays four metrics on completion:
        </Lead>
        <MetricGrid
          items={[
            { term: "Gain", def: "Eye-vs-target velocity ratio. 1.0 perfect; <0.7 reduced." },
            { term: "Accuracy", def: "100 − mean position error, in percent." },
            { term: "Saccade rate", def: "Velocity-spike count per second — lower is smoother." },
            { term: "Latency", def: "Phase shift between target and gaze, in milliseconds." },
          ]}
        />
        <Callout tone="tip" title="Run history">
          Every completed pursuit is saved to your account. The caregiver Vision page plots the gain
          trend across sessions with a healthy reference band.
        </Callout>
      </>
    ),
  },
  {
    id: "patient-games",
    section: "patient",
    title: "Memory games",
    subtitle: "Short cognitive exercises that build a personal baseline",
    icon: Gamepad2,
    body: (
      <>
        <Lead>
          Each game emits memory-span and reaction-time samples. The caregiver Cognition page tracks
          them across days and flags meaningful drops.
        </Lead>
        <Heading>What's in the gallery</Heading>
        <Bullets
          items={[
            <>
              <strong>Simon</strong> — increasing colour-sequence recall.
            </>,
            <>
              <strong>Sequence recall</strong> — number / pattern memorisation.
            </>,
            <>
              <strong>Quick math</strong> — small arithmetic with a soft time limit.
            </>,
            <>
              <strong>Matching pairs</strong> — classic concentration / memory.
            </>,
            <>
              <strong>Bubble pop</strong> — tap numbers in ascending order under time pressure.
            </>,
            <>
              <strong>Reaction light</strong> — single-trial reaction speed.
            </>,
            <>
              <strong>Word association / visual search / reasoning</strong> — variety packs.
            </>,
          ]}
        />
        <Heading>How scoring works</Heading>
        <Lead>
          Memory span is the longest sequence you successfully reproduced. Reaction time is the
          rolling median across the session, ignoring the first two trials as warm-up. Decline
          alerts compare new sessions against your own rolling 10-session baseline — never against
          someone else's data.
        </Lead>
      </>
    ),
  },
  {
    id: "patient-people",
    section: "patient",
    title: "People",
    subtitle: "Family, doctor, emergency line — one tap away",
    icon: Users,
    body: (
      <>
        <Lead>
          The people scene shows everyone who's been added to your circle, with big call buttons.
          The emergency contact gets a red accent and pins to the top.
        </Lead>
        <Heading>Calling someone</Heading>
        <Steps
          items={[
            <>Tap the contact card.</>,
            <>
              The system phone dialer opens with their number pre-filled (using the{" "}
              <code>tel:</code> URL scheme). Tap-to-message uses <code>sms:</code> the same way.
            </>,
          ]}
        />
        <Heading>Adding & editing</Heading>
        <Bullets
          items={[
            <>
              Tap <strong>Add person</strong> in the top right. Fill name, relationship, phone,
              optional photo, optional emergency flag, then Save.
            </>,
            <>
              Tap the pencil icon on any card to edit. <strong>Remove</strong> deletes the person
              with a confirm prompt.
            </>,
            <>
              <strong>Either</strong> the patient or the paired caregiver can add / edit / remove —
              changes sync within a second via the backend.
            </>,
          ]}
        />
        <Callout tone="info" icon={<Phone size={16} />}>
          The emergency contact is always pinned to the top regardless of input order — the patient
          shouldn't have to hunt for it during a crisis.
        </Callout>
      </>
    ),
  },
  {
    id: "patient-memories",
    section: "patient",
    title: "Memories",
    subtitle: "Captioned photos for familiar faces and places",
    icon: ImageIcon,
    body: (
      <>
        <Lead>
          A photo grid built by either side of the pair. Each memory has a caption (a person's name,
          a place, a date) and an optional context line.
        </Lead>
        <Heading>Adding a memory</Heading>
        <Steps
          items={[
            <>
              Tap <strong>Add memory</strong> in the top right.
            </>,
            <>
              Pick a photo. Limit is 10 MiB and ~25 megapixels — the client refuses anything bigger.
            </>,
            <>
              Write a short caption (who / when / where) and an optional context line. Tap{" "}
              <strong>Save</strong>.
            </>,
            <>The grid updates immediately; your caregiver sees the same list.</>,
          ]}
        />
        <Callout tone="info">
          Memories are stored in the backend Postgres database. Photos travel as base64 data URLs
          inside encrypted columns. The Aiven free-tier disk is ~1 GB total, so keep individual
          photos modest if you're shipping lots of them.
        </Callout>
      </>
    ),
  },
  {
    id: "patient-profile",
    section: "patient",
    title: "Profile",
    subtitle: "Personal details, pairing, account settings",
    icon: User,
    body: (
      <>
        <Lead>
          One place to manage your details, your pairing with a caregiver, and your account.
        </Lead>
        <Heading>Editing details</Heading>
        <Steps
          items={[
            <>
              Tap <strong>Edit details</strong>.
            </>,
            <>
              Change name, preferred name, date of birth, blood type, home address, allergies,
              medical notes, and photo. Tap <strong>Save</strong>.
            </>,
            <>
              While editing, the form is a local draft — your typed text won't disappear if a
              background refresh lands. Tap <strong>Cancel</strong> to discard changes.
            </>,
          ]}
        />
        <Heading>Conflict prompt</Heading>
        <Lead>
          If the paired caregiver edits the same profile while you're typing, Save will pop a
          confirm prompt before overwriting their changes — and symmetrically for the caregiver when
          you edit. Pick the version you want and continue.
        </Lead>
        <Heading>Caregiver lock</Heading>
        <Lead>
          A caregiver can switch on a <strong>Lock editing</strong> toggle from their Manage page.
          When set, the patient's Edit button is hidden and the server refuses any self-edit. The
          patient sees an amber banner explaining the lock and how to ask for it to be removed.
        </Lead>
        <Heading>Pairing card</Heading>
        <Lead>
          Below the profile is the pairing card. Generate a code, redeem one, or unpair. Unpairing
          deletes the pairing row on the server, the caregiver loses access immediately, and the
          live WebSocket subscription is torn down without waiting for a reconnect.
        </Lead>
        <Heading>Account settings</Heading>
        <Lead>
          Below pairing: change display name and username, change password, switch language, or
          permanently delete the account. Account deletion needs your current password plus a
          typed-username confirmation, then cascades through every patient-scoped table.
        </Lead>
      </>
    ),
  },
  {
    id: "patient-map",
    section: "patient",
    title: "Map",
    subtitle: "Where you are, with a comfort radius around home",
    icon: MapPinned,
    body: (
      <>
        <Lead>
          The patient's map shows your live location with a soft comfort circle around home and a
          short breadcrumb of the last few minutes. It's a calm view; the wandering / dwelling
          detectors run silently behind the scenes and surface only to the caregiver.
        </Lead>
        <Heading>What it does</Heading>
        <Bullets
          items={[
            "Live GPS marker with a confidence ring.",
            "Soft 'home base' shading set from the caregiver Manage page.",
            "Breadcrumb of the last ~30 location samples — fades as it ages.",
            "Recenter (crosshair) button bottom-right above the zoom widget.",
          ]}
        />
        <Callout tone="info" icon={<Lock size={16} />}>
          The location is shared with your paired caregiver via the live WebSocket feed — never
          stored as a permanent trail, never broadcast publicly. Sign out, unpair, or close the tab
          and the stream stops.
        </Callout>
      </>
    ),
  },

  // ============================ CAREGIVER ============================
  {
    id: "caregiver-overview",
    section: "caregiver",
    title: "Overview",
    subtitle: "The caregiver landing scene",
    icon: HomeIcon,
    body: (
      <>
        <Lead>
          The first scene caregivers see. Reads the live WebSocket feed from the paired patient and
          presents a calm summary — patient name + photo, an online / offline pill, four metric
          tiles drilling into detail pages, and a recent-activity preview.
        </Lead>
        <Heading>Metric tiles</Heading>
        <MetricGrid
          items={[
            { term: "Location", def: "Distance from home + safe-zone state." },
            { term: "Gait", def: "Live label + fall-risk score from the patient's motion stream." },
            { term: "Vision", def: "Ocular-risk band + blink rate from the patient's camera." },
            { term: "Cognition", def: "Latest memory span + reaction time + decline flag." },
          ]}
        />
        <Heading>Online / offline pill</Heading>
        <Lead>
          Pill is "Online" while a <code>patient_state</code> message arrived within the last 10
          seconds AND the WS handshake is healthy. Otherwise "Offline" with a relative-time hint.
          The amber <em>Live updates paused</em> banner appears if the channel has been down for
          more than 15 seconds — usually a strict-third-party-cookie browser blocking the WS upgrade
          cookie.
        </Lead>
      </>
    ),
  },
  {
    id: "caregiver-map",
    section: "caregiver",
    title: "Map",
    subtitle: "Geofencing, wandering, dwelling — on the patient's GPS",
    icon: MapPinned,
    body: (
      <>
        <Lead>
          Renders the <strong>patient's</strong> live GPS from the WebSocket feed (not the
          caregiver's own location). OpenStreetMap tiles, a draggable safe-zone marker, an
          adjustable radius, and three detectors running in parallel.
        </Lead>
        <Heading>Detectors</Heading>
        <Bullets
          items={[
            <>
              <strong>Geofence breach</strong> — patient leaves the safe-zone radius.
            </>,
            <>
              <strong>Dwelling</strong> — stationary in an unusual location for too long.
            </>,
            <>
              <strong>Pacing</strong> — back-and-forth pattern often associated with confusion.
            </>,
          ]}
        />
        <Callout tone="info">
          Drag the home marker to set the safe-zone centre; use the slider to tune the radius. The
          setting is per-caregiver and stored in localStorage today (server-side migration is a
          known follow-up).
        </Callout>
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
          Reads the patient device's accelerometer + gyroscope over the live feed and runs a
          heuristic classifier on a rolling window. The waveform shows acceleration magnitude; the
          variance + step-cadence panels explain why the model chose its label.
        </Lead>
        <Heading>Classes</Heading>
        <MetricGrid
          items={[
            { term: "Normal", def: "Stable rhythmic gait." },
            { term: "Shuffling", def: "Reduced lift + smaller forward stride." },
            { term: "Irregular", def: "High variance, lateral drift dominates." },
            { term: "Fall detected", def: "Sharp impact spike followed by ~0.85 s of stillness." },
          ]}
        />
        <Callout tone="warn" icon={<AlertCircle size={16} />}>
          On desktop machines without motion sensors, enable Simulations from the parameters panel
          to drive plausible motion traces so you can see the pipeline end-to-end. The fall scenario
          triggers a 5 g spike + stillness gate that's known to clear the classifier.
        </Callout>
      </>
    ),
  },
  {
    id: "caregiver-vision",
    section: "caregiver",
    title: "Vision",
    subtitle: "Ocular biomarkers, pursuit history, optional self-test",
    icon: Eye,
    body: (
      <>
        <Lead>
          The caregiver mirror of the patient eye check. Hero card shows current ocular risk; a
          status grid + live face mesh sit beside the pursuit gain trend chart.
        </Lead>
        <Heading>Pursuit gain trend</Heading>
        <Lead>
          The most clinically discriminating signal in this app. The mini-chart plots the patient's
          last 10 sessions with a healthy reference band (gain 0.85–1.15) shaded green, points
          coloured by per-session risk.
        </Lead>
        <Heading>What to watch</Heading>
        <Bullets
          items={[
            "Single low-gain session: usually a bad calibration day, not clinically meaningful.",
            "Three consecutive sessions below 0.7: clinically meaningful trend; flag in care notes.",
            "Saccade rate climbing while gain falls: anti-saccade-style impairment.",
          ]}
        />
        <Heading>Self-test mode</Heading>
        <Lead>
          A <strong>Self test</strong> tab lets the caregiver run the same calibration + pursuit on
          this device. Useful when the patient's own device is unavailable; results still save
          against the paired patient's history.
        </Lead>
      </>
    ),
  },
  {
    id: "caregiver-trends",
    section: "caregiver",
    title: "Cognition",
    subtitle: "Memory span and reaction time over time",
    icon: Brain,
    body: (
      <>
        <Lead>
          A pair of mini-charts plotting memory span + reaction time across all stored game sessions
          for the paired patient, with rolling 10-session baselines and decline flags.
        </Lead>
        <Heading>Decline detection</Heading>
        <Lead>
          Each new session is compared against the rolling baseline. A drop more than 1 SD below the
          patient's own mean fires a cognition alert that lands in the Alerts feed. Per-patient
          baselines so individual variability doesn't trigger false positives.
        </Lead>
      </>
    ),
  },
  {
    id: "caregiver-screening",
    section: "caregiver",
    title: "Screening",
    subtitle: "Four ML risk models served from the backend",
    icon: ClipboardList,
    body: (
      <>
        <Lead>
          Bundled risk models that run on the FastAPI service via ONNX Runtime / LightGBM / CatBoost
          / XGBoost. Each tab has its own input pane appropriate to the model.
        </Lead>
        <Heading>The four tabs</Heading>
        <Bullets
          items={[
            <>
              <strong>Clinical questionnaire</strong> — LightGBM gradient-boosting classifier on 32
              features. Honest CV: accuracy 0.955, AUC 0.96. Fill in demographics, lifestyle,
              comorbidities, vitals, observed cognitive symptoms.
            </>,
            <>
              <strong>OASIS / brain volumes</strong> — CatBoost on 17 engineered features over the
              OASIS-2 longitudinal MRI cohort. Honest GroupKFold-by-subject AUC ≈ 0.88. Includes
              eTIV / nWBV / ASF with population-median defaults.
            </>,
            <>
              <strong>Daily agitation forecast</strong> — CatBoost on 41 raw daily fields from TIHM
              1.5. 3-seed × 5-fold GroupKFold-by-patient AUC ≈ <strong>0.890</strong>. Class
              prevalence is 4 %, so default 0.5 threshold has low precision by design; the AUC is
              the meaningful number.
            </>,
            <>
              <strong>MRI image</strong> — EfficientNetV2-S (timm, ImageNet-pretrained) fine-tuned
              on 4-class brain MRI. Image-level CV: macro-F1 <strong>0.994</strong>, AUC 1.00 over a
              5120-train / 1280-test split. Inference applies horizontal-flip TTA to match the
              training-time eval, and an out-of-distribution gate refuses to label non-MRI uploads.
            </>,
          ]}
        />
        <Heading>"How well does it work?"</Heading>
        <Lead>
          Every tab has a <strong>How well does it work?</strong> button that opens a popover with
          accuracy / precision / recall / F1 / AUC and a plain-English caveat block. The numbers
          come from <code>datasets/scripts/eval_screening_metrics.py</code> re-fitting each model in
          honest CV.
        </Lead>
        <Callout tone="warn" title="Educational tools, not diagnoses">
          These models are demos trained on small public datasets. They are not approved medical
          devices and should not drive clinical decisions on their own.
        </Callout>
      </>
    ),
  },
  {
    id: "caregiver-manage",
    section: "caregiver",
    title: "Manage",
    subtitle: "Edit the paired patient's care record",
    icon: UserCog,
    body: (
      <>
        <Lead>
          The caregiver's primary edit surface for the paired patient. Four sections; each saves to
          the backend so the patient's device sees the change within a second.
        </Lead>
        <Bullets
          items={[
            <>
              <strong>Profile</strong> — name, photo, DOB, blood type, allergies, home address,
              medical notes, lock toggle. PII columns are encrypted at-rest with Fernet.
            </>,
            <>
              <strong>Contacts</strong> — add / patch / remove people. Mark one as the emergency
              contact (always pinned for the patient).
            </>,
            <>
              <strong>Reminders</strong> — daily routine items the patient marks done. The toggle is
              a dedicated server endpoint that avoids the read-modify-write race when both devices
              act at once.
            </>,
            <>
              <strong>Memories</strong> — captioned photos. Same edit-with-form pattern as the
              patient side.
            </>,
          ]}
        />
        <Heading>Profile editor — save vs draft</Heading>
        <Lead>
          The profile editor uses a Save + Cancel pattern (not per-keystroke writes) so a stray
          background refetch never overwrites in-flight typing. Photo upload + lock-toggle while
          editing mutate the draft, not the canonical row — both flush in a single PUT on Save.
        </Lead>
      </>
    ),
  },
  {
    id: "caregiver-alerts",
    section: "caregiver",
    title: "Alerts",
    subtitle: "Anomaly feed across location, gait, vision, cognition",
    icon: Bell,
    body: (
      <>
        <Lead>
          Everything the app detects worth surfacing — geofence breach, dwelling, pacing, fall
          signature, vision spike, cognition decline — lands here. The bell badge in the top bar
          shows the unread count.
        </Lead>
        <Heading>Managing alerts</Heading>
        <Bullets
          items={[
            "Tap an alert to mark it read.",
            <>
              <strong>Dismiss</strong> removes one. <strong>Clear all</strong> empties the feed.
            </>,
            "Alerts use a rising-edge guard — a single anomaly fires once, not repeatedly while the condition persists.",
          ]}
        />
      </>
    ),
  },

  // ============================ SYSTEM ============================
  {
    id: "live-link",
    section: "system",
    title: "Live link",
    subtitle: "WebSocket feed, offline / displaced banners, multi-device",
    icon: Radio,
    body: (
      <>
        <Lead>
          The "live" half of the app — a single WebSocket carries the patient's 1 Hz state snapshot
          (vision, gait, GPS, wandering) to the paired caregiver. The same channel drives the
          Overview status pill, the live Map marker, and the Vision face-mesh refresh.
        </Lead>
        <Heading>How the connection works</Heading>
        <Bullets
          items={[
            <>
              One WebSocket per browser session, authenticated by the same{" "}
              <code>cogni_session</code> cookie the REST endpoints use.
            </>,
            <>
              Patient side: <code>useLiveStreamSender</code> aggregates the latest sensor readings
              and pushes a JSON snapshot once per second.
            </>,
            <>
              Caregiver side: <code>useLiveStream</code> subscribes to the paired patient's topic
              and exposes the latest snapshot to every consuming scene.
            </>,
            <>
              Exponential backoff reconnect (1 s → 30 s with jitter). Connection is torn down at
              sign-out and on unpair.
            </>,
          ]}
        />
        <Heading>"Live updates paused" banner</Heading>
        <Lead>
          If the WS has been non-open for more than 15 s while you're signed in, an amber banner
          appears. Common cause: strict-third-party-cookie browsers (Chrome incognito with new
          defaults, Safari ITP, Brave) refuse the cross-origin cookie on the WS upgrade. REST still
          works because Vercel proxies <code>/api/*</code> first-party.
        </Lead>
        <Heading>Multi-device patient handoff</Heading>
        <Lead>
          The patient can have only one device acting as the primary monitor at a time — otherwise
          the caregiver's live feed flickers between feeds. The server enforces this with a
          single-writer registry: when a second patient device connects, it claims the slot and the
          first device is "displaced" (it gets a polite message + close code 4001).
        </Lead>
        <Lead>
          The displaced device shows a sticky amber banner with a <strong>Use this device</strong>{" "}
          button. Tapping it reclaims primary, which in turn displaces whichever device currently
          holds it. Use this when handing the patient's phone over to a family member, or switching
          from phone to tablet.
        </Lead>
      </>
    ),
  },
  {
    id: "privacy",
    section: "system",
    title: "Privacy & data",
    subtitle: "What lives where, what crosses the network",
    icon: Lock,
    body: (
      <>
        <Lead>
          Cogni is NOT end-to-end encrypted. The server can read every byte; that's required so the
          ML inference models can actually run on the input. But sensitive PII gets layered
          protection that defends against the most likely real-world threats (accidental DB dumps,
          backup leaks, snapshot theft).
        </Lead>
        <Heading>In transit</Heading>
        <Bullets
          items={[
            "TLS to both the HF Space backend and the Aiven Postgres database (HTTPS + sslmode=require).",
            "Session cookie is HttpOnly + Secure + SameSite=None — JS cannot read it, defends against XSS replay.",
            "Vercel rewrites /api/* first-party so the cookie stays SameSite-safe in browsers with strict cookie rules.",
          ]}
        />
        <Heading>At rest</Heading>
        <Bullets
          items={[
            "Aiven encrypts disk volumes by default.",
            "Seven PII columns (profile name, allergies, medical notes, home address, contact name, contact phone) are wrapped with Fernet (AES-128-CBC + HMAC-SHA-256) before insert. Defends against accidental DB dumps; does NOT defend against a compromised app server.",
            "Passwords use Argon2id with the OWASP-recommended cost. Plaintext is never persisted or logged.",
            "Session tokens are stored as sha256(token) — the raw token only lives in the cookie.",
          ]}
        />
        <Heading>On the device</Heading>
        <Bullets
          items={[
            "Camera frames are processed in-browser by MediaPipe — never sent anywhere.",
            "Calibration model + click-stream samples live in localStorage on each device.",
            "Some patient-side preferences (safe-zone centre, voice prompts, sidebar collapse) still use localStorage; everything user-bound is wiped on sign-out.",
          ]}
        />
        <Heading>What does cross the network</Heading>
        <Bullets
          items={[
            "Initial app load (HTML, JS, CSS, ONNX MRI model + meta) from Vercel + HF Space.",
            "OpenStreetMap tile fetches for the map.",
            "MediaPipe face-mesh model on first eye-check open.",
            "1 Hz WebSocket patient_state from the patient device to the caregiver (via the FastAPI service).",
            "Screening inferences as multipart / JSON POSTs to the FastAPI service.",
          ]}
        />
        <Callout tone="info">
          Delete-account is a single API call that cascades through every patient-scoped table.
          Caregiver-side delete unpairs but leaves the patient's data alive; symmetric for the
          patient deleting their own account.
        </Callout>
      </>
    ),
  },
  {
    id: "shortcuts",
    section: "system",
    title: "Shortcuts & accessibility",
    subtitle: "Keys, language, touch targets, reduced motion",
    icon: Keyboard,
    body: (
      <>
        <Lead>
          The app is mobile-first but works on desktop too. A handful of shortcuts and a11y notes.
        </Lead>
        <Heading>Keyboard</Heading>
        <Bullets
          items={[
            <>
              <Kbd>Esc</Kbd> — close any modal (this guide, parameters, dialogs).
            </>,
            <>
              <Kbd>Tab</Kbd> / <Kbd>Shift+Tab</Kbd> — move focus through the active scene.
            </>,
            <>
              In this guide: <Kbd>←</Kbd> / <Kbd>→</Kbd> for previous / next chapter.
            </>,
          ]}
        />
        <Heading>Touch targets</Heading>
        <Lead>
          Every button on the patient view is at least 44 × 44 px to meet mobile accessibility
          guidelines. Bottom nav is icon-with-label; screen readers get a label per icon.
        </Lead>
        <Heading>Reduced motion</Heading>
        <Lead>
          Framer-motion respects <code>prefers-reduced-motion</code> at the OS level. Cards still
          appear but spring transitions are dampened.
        </Lead>
        <Heading>Language</Heading>
        <Lead>
          See the <strong>Language</strong> chapter — four pills in the top-right account menu let
          users switch between English / 中文 / Bahasa Melayu / தமிழ் from any scene without
          reloading. The picker also lives on the sign-in screen so language can be set before
          authentication.
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
export default function OnboardingGuide({ open, currentView, onClose }: OnboardingGuideProps) {
  const { t } = useTranslation();
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
    () =>
      Math.max(
        0,
        chapters.findIndex((c) => c.id === activeId),
      ),
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
              {t("onboardingGuide.cogniUserGuide")}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {t("onboardingGuide.chapter")} {activeIndex + 1} of {chapters.length} ·{" "}
              {SECTION_LABELS[chapter.section]}
            </DialogDescription>
          </div>
        </header>

        {/* Body: sidebar + content */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-slate-200">
            <ChapterListMobile chapters={chapters} activeId={activeId} onSelect={setActiveId} />
            <ChapterListDesktop chapters={chapters} activeId={activeId} onSelect={setActiveId} />
          </aside>

          <main className="flex min-h-0 flex-1 flex-col">
            <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
              <AnimatePresence mode="wait">
                <motion.article
                  key={chapter.id}
                  initial={{
                    opacity: 0,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -8,
                  }}
                  transition={{
                    duration: 0.18,
                  }}
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
                <span className="hidden sm:inline">{t("onboardingGuide.previous")}</span>
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
                  {t("onboardingGuide.done")}
                </Button>
              ) : (
                <Button variant="primary" iconRight={<ArrowRight size={14} />} onClick={goNext}>
                  {t("onboardingGuide.next")}
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
  const { t } = useTranslation();
  return (
    <nav aria-label={t("onboardingGuide.guideChapters")} className="hidden md:block md:py-4">
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
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                          }}
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
  const { t } = useTranslation();
  return (
    <div className="border-b border-slate-200 p-3 md:hidden">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {t("onboardingGuide.chapter")}
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
