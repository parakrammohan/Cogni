import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Phone,
} from "lucide-react";

import { Avatar } from "../../components/ui/Avatar";
import { cx } from "../../lib/utils";
import type {
  CareContact,
  CareReminder,
  PatientProfile,
} from "../../features/care/types";
import type {
  GaitAnalysis,
  GameSession,
  LocationAnalysis,
  SensorStatus,
  VisionMetrics,
} from "../../types/app";

type Scene =
  | "home"
  | "map"
  | "ocular"
  | "cognitive"
  | "people"
  | "memories"
  | "profile";

interface HomeSceneProps {
  profile: PatientProfile;
  contacts: ReadonlyArray<CareContact>;
  reminders: ReadonlyArray<CareReminder>;
  gameHistory: ReadonlyArray<GameSession>;
  onToggleReminder: (id: string) => void;
  /** Kept in the prop bag for symmetry — used only via patientStatus. */
  gait: GaitAnalysis;
  locationAnalysis: LocationAnalysis;
  visionMetrics: VisionMetrics;
  patientStatus: string;
  onNavigate: (scene: Scene) => void;
  hasMemories: boolean;
  sensorStatus: SensorStatus;
}

/**
 * Patient Home — intentionally calm and focused. Three things matter:
 *   1. who am I, what's the time, how am I doing right now (hero)
 *   2. what do I need to do today (reminders)
 *   3. who do I call when I need help (contacts)
 *
 * Permissions live in their respective scenes (Map / Eye / etc.) — no
 * "Health monitoring" section here cluttering the home page.
 */
export function HomeScene({
  profile,
  contacts,
  reminders,
  gameHistory,
  onToggleReminder,
  patientStatus,
  onNavigate,
}: HomeSceneProps) {
  const todays = useSortedReminders(reminders);
  const closeContacts = sortContacts(contacts).slice(0, 4);
  const completedToday = todays.filter((r) => r.completedAt !== null).length;

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={CONTAINER_VARIANTS}
    >
      {/* Hero — calm, time + greeting + a single status line */}
      <motion.section
        variants={ITEM_VARIANTS}
        className="relative overflow-hidden rounded-3xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-sky-50 to-white px-6 py-7 sm:px-8 sm:py-9"
      >
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_60%)] opacity-70"
          aria-hidden
        />
        <div className="relative">
          <LiveClock />
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            Hi {profile.preferredName || profile.name.split(" ")[0]}.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-700 sm:text-base">
            {patientStatus}
          </p>
        </div>
      </motion.section>

      {/* Today's reminders — the biggest, most useful block on the page */}
      <motion.section variants={ITEM_VARIANTS}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-display text-lg font-semibold text-slate-900 sm:text-xl">
            Today
          </h2>
          <span className="text-xs font-medium text-slate-500">
            {todays.length === 0
              ? "Nothing scheduled"
              : `${completedToday} of ${todays.length} done`}
          </span>
        </div>
        {todays.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No reminders today. Enjoy your free time.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {todays.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                onToggle={() => onToggleReminder(reminder.id)}
              />
            ))}
          </ul>
        )}
      </motion.section>

      {/* People — quick call, emergency contact pinned */}
      {closeContacts.length > 0 ? (
        <motion.section variants={ITEM_VARIANTS}>
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="font-display text-lg font-semibold text-slate-900 sm:text-xl">
              Quick call
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("people")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
            >
              All contacts <ArrowRight size={12} aria-hidden />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {closeContacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </div>
        </motion.section>
      ) : null}

      {/* Recent wins — small text block, no boxy card overload */}
      <motion.section variants={ITEM_VARIANTS}>
        <div className="mb-3 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent wins
          </h2>
        </div>
        <RecentActivity reminders={reminders} gameHistory={gameHistory} />
      </motion.section>
    </motion.div>
  );
}

const CONTAINER_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 360, damping: 30 },
  },
};

function RecentActivity({
  reminders,
  gameHistory,
}: {
  reminders: ReadonlyArray<CareReminder>;
  gameHistory: ReadonlyArray<GameSession>;
}) {
  const sessions = gameHistory.filter((s) => s.status !== "checkpoint").slice(-2).reverse();
  const completed = reminders
    .filter((r) => r.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 2);
  const items: { key: string; title: string; subtitle: string; tone: "cyan" | "emerald" }[] = [];
  for (const session of sessions) {
    items.push({
      key: `s-${session.id}`,
      title: "Memory game completed",
      subtitle: `Span ${session.memorySpan} · ${Math.round(session.avgReaction)}ms reaction`,
      tone: "cyan",
    });
  }
  for (const reminder of completed) {
    items.push({
      key: `r-${reminder.id}`,
      title: `Done: ${reminder.label}`,
      subtitle: reminder.notes || "Marked complete",
      tone: "emerald",
    });
  }
  if (items.length === 0) {
    return (
      <p className="px-1 text-sm leading-6 text-slate-500">
        Your wins from today and recent days will appear here. Try a memory game to log your first
        baseline.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5 px-1 text-sm">
      {items.slice(0, 4).map((item) => (
        <li key={item.key} className="flex items-start gap-3">
          <span
            className={cx(
              "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
              item.tone === "emerald" ? "bg-emerald-500" : "bg-cyan-500",
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="font-medium text-slate-900">{item.title}</div>
            <div className="text-xs text-slate-500">{item.subtitle}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReminderRow({
  reminder,
  onToggle,
}: {
  reminder: CareReminder;
  onToggle: () => void;
}) {
  const done = reminder.completedAt !== null;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition",
          done
            ? "border-emerald-200 bg-emerald-50/70"
            : "border-slate-200 bg-white shadow-(--shadow-soft) hover:border-cyan-300",
        )}
        aria-pressed={done}
      >
        <span
          className={cx(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 bg-white text-transparent hover:border-cyan-400",
          )}
          aria-hidden
        >
          <Check size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cx(
              "text-base font-semibold leading-5",
              done ? "text-emerald-900 line-through" : "text-slate-900",
            )}
          >
            {reminder.label}
          </div>
          {reminder.notes ? (
            <div className="mt-0.5 text-sm leading-5 text-slate-500">{reminder.notes}</div>
          ) : null}
        </div>
        <span
          className={cx(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
            done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700",
          )}
        >
          <Clock size={12} aria-hidden />
          {reminder.time}
        </span>
      </button>
    </li>
  );
}

function ContactRow({ contact }: { contact: CareContact }) {
  return (
    <a
      href={`tel:${contact.phone.replace(/\s+/g, "")}`}
      className={cx(
        "group flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-(--shadow-soft) transition hover:-translate-y-0.5",
        contact.isEmergency
          ? "border-red-200 hover:border-red-300"
          : "border-slate-200 hover:border-cyan-300",
      )}
    >
      <Avatar
        name={contact.name}
        src={contact.photo || undefined}
        size="lg"
        hue={contact.isEmergency ? "rose" : "cyan"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold text-slate-900">{contact.name}</span>
          {contact.isEmergency ? (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
              SOS
            </span>
          ) : null}
        </div>
        <div className="truncate text-sm text-slate-500">{contact.relationship}</div>
      </div>
      <span
        className={cx(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition group-hover:scale-105",
          contact.isEmergency ? "bg-red-500" : "bg-emerald-500",
        )}
        aria-hidden
      >
        <Phone size={18} />
      </span>
    </a>
  );
}

function LiveClock() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-display text-2xl font-semibold tabular-nums text-slate-900 sm:text-3xl">
        {time}
      </span>
      <span className="text-sm text-slate-600 sm:text-base">{date}</span>
    </div>
  );
}

function useSortedReminders(reminders: ReadonlyArray<CareReminder>): CareReminder[] {
  return [...reminders].sort((a, b) => a.time.localeCompare(b.time));
}

function sortContacts(contacts: ReadonlyArray<CareContact>): CareContact[] {
  // Emergency first, then rest in declared order.
  const emergency = contacts.filter((c) => c.isEmergency);
  const rest = contacts.filter((c) => !c.isEmergency);
  return [...emergency, ...rest];
}
