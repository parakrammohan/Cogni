import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Brain,
  Camera,
  Check,
  Clock,
  Eye,
  ImageIcon,
  MapPinned,
  Phone,
  Target,
  User,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

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
  SensorState,
  SensorStatus,
  VisionMetrics,
} from "../../types/app";

type Scene = "home" | "ocular" | "pursuit" | "cognitive" | "people" | "memories" | "profile";

interface HomeSceneProps {
  profile: PatientProfile;
  contacts: ReadonlyArray<CareContact>;
  reminders: ReadonlyArray<CareReminder>;
  gameHistory: ReadonlyArray<GameSession>;
  onToggleReminder: (id: string) => void;
  gait: GaitAnalysis;
  locationAnalysis: LocationAnalysis;
  visionMetrics: VisionMetrics;
  patientStatus: string;
  onNavigate: (scene: Scene) => void;
  hasMemories: boolean;
  sensorStatus: SensorStatus;
  onToggleGeolocation: () => void;
  onToggleMotion: () => void;
  onToggleCamera: () => void;
}

export function HomeScene({
  profile,
  contacts,
  reminders,
  gameHistory,
  onToggleReminder,
  gait,
  locationAnalysis,
  visionMetrics,
  patientStatus,
  onNavigate,
  hasMemories,
  sensorStatus,
  onToggleGeolocation,
  onToggleMotion,
  onToggleCamera,
}: HomeSceneProps) {
  const todays = useTodayReminders(reminders);
  const closeContacts = contacts.filter((c) => !c.isEmergency).slice(0, 3);
  const completedToday = todays.filter((r) => r.completedAt !== null).length;
  void locationAnalysis; // surfaced via patientStatus from the parent
  void gait;
  void visionMetrics;

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={CONTAINER_VARIANTS}
    >
      {/* Hero — calm, stable surface */}
      <motion.section
        variants={ITEM_VARIANTS}
        className="relative overflow-hidden rounded-3xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-sky-50 to-white px-6 py-7 sm:px-8 sm:py-9"
      >
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_60%)] opacity-70"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <LiveClock />
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              Hi {profile.preferredName || profile.name.split(" ")[0]}.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-700 sm:text-base">
              {patientStatus}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("profile")}
            className="flex items-center gap-3 self-start rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-left shadow-sm backdrop-blur transition hover:bg-white"
            aria-label="Open profile"
          >
            <Avatar
              name={profile.name}
              src={profile.photo || undefined}
              size="md"
              hue="cyan"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {profile.name}
              </span>
              <span className="block text-[11px] uppercase tracking-wider text-slate-500">
                View profile
              </span>
            </span>
          </button>
        </div>
      </motion.section>

      {/* Today's reminders */}
      {todays.length > 0 ? (
        <motion.section variants={ITEM_VARIANTS}>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Today
            </h2>
            <span className="text-xs text-slate-500">
              {completedToday}/{todays.length} done
            </span>
          </div>
          <ul className="space-y-2">
            {todays.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                onToggle={() => onToggleReminder(reminder.id)}
              />
            ))}
          </ul>
        </motion.section>
      ) : null}

      {/* Quick contacts */}
      {closeContacts.length > 0 ? (
        <motion.section variants={ITEM_VARIANTS}>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              People
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("people")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
            >
              See all <ArrowRight size={12} aria-hidden />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {closeContacts.map((contact) => (
              <a
                key={contact.id}
                href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:border-cyan-200"
              >
                <Avatar name={contact.name} src={contact.photo || undefined} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {contact.name}
                  </div>
                  <div className="truncate text-xs text-slate-500">{contact.relationship}</div>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-100">
                  <Phone size={14} aria-hidden />
                </span>
              </a>
            ))}
          </div>
        </motion.section>
      ) : null}

      {/* Today's checks */}
      <motion.section variants={ITEM_VARIANTS}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Today&apos;s checks
          </h2>
          <span className="text-xs text-slate-500">~4 minutes total</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionTile
            icon={Eye}
            title="Eye check"
            blurb="Live blink &amp; gaze analysis"
            duration="1 min"
            onClick={() => onNavigate("ocular")}
          />
          <ActionTile
            icon={Target}
            title="Pursuit test"
            blurb="Follow a moving target"
            duration="15 sec"
            onClick={() => onNavigate("pursuit")}
          />
          <ActionTile
            icon={Brain}
            title="Memory game"
            blurb="Sequence recall + reasoning"
            duration="2 min"
            onClick={() => onNavigate("cognitive")}
          />
        </div>
      </motion.section>

      {/* Memories preview / shortcuts */}
      <motion.section variants={ITEM_VARIANTS} className="grid gap-3 sm:grid-cols-2">
        <ShortcutCard
          icon={ImageIcon}
          title="Photo memories"
          blurb={hasMemories ? "Look back at recent photos" : "Your caregiver hasn't added photos yet"}
          onClick={() => onNavigate("memories")}
        />
        <ShortcutCard
          icon={User}
          title="My profile"
          blurb="Personal details and emergency info"
          onClick={() => onNavigate("profile")}
        />
      </motion.section>

      {/* Health monitoring — sensor enable surface for the patient */}
      <motion.section variants={ITEM_VARIANTS}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Health monitoring
          </h2>
          <span className="text-xs text-slate-500">
            {countActive(sensorStatus)} of 3 active
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <SensorEnableCard
            icon={<MapPinned size={16} />}
            label="Location"
            description="Wandering & safe-zone watch"
            status={sensorStatus.geo}
            onToggle={onToggleGeolocation}
          />
          <SensorEnableCard
            icon={<Activity size={16} />}
            label="Movement"
            description="Gait stability & fall risk"
            status={sensorStatus.motion}
            onToggle={onToggleMotion}
          />
          <SensorEnableCard
            icon={<Camera size={16} />}
            label="Camera"
            description="Eye check & pursuit test"
            status={sensorStatus.camera}
            onToggle={onToggleCamera}
          />
        </div>
      </motion.section>

      {/* Recent wins — patient-friendly, no clinical anomalies */}
      <motion.section variants={ITEM_VARIANTS}>
        <div className="mb-3 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent activity
          </h2>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-(--shadow-soft)">
          <RecentActivity reminders={reminders} gameHistory={gameHistory} />
        </div>
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
      <p className="text-slate-600">
        Your wins from today and recent days will appear here. Try a memory game to log your first
        baseline.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.slice(0, 4).map((item) => (
        <li key={item.key} className="flex items-start gap-3">
          <span
            className={cx(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              item.tone === "emerald" ? "bg-emerald-500" : "bg-cyan-500",
            )}
            aria-hidden
          />
          <div>
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
          "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
          done
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-slate-200 bg-white shadow-(--shadow-soft) hover:border-cyan-200",
        )}
        aria-pressed={done}
      >
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition",
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 bg-white text-transparent",
          )}
          aria-hidden
        >
          <Check size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cx(
              "text-sm font-semibold",
              done ? "text-emerald-900 line-through" : "text-slate-900",
            )}
          >
            {reminder.label}
          </div>
          {reminder.notes ? (
            <div className="text-xs text-slate-500">{reminder.notes}</div>
          ) : null}
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          <Clock size={12} aria-hidden />
          {reminder.time}
        </span>
      </button>
    </li>
  );
}

function ActionTile({
  icon: Icon,
  title,
  blurb,
  duration,
  onClick,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  blurb: string;
  duration: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-(--shadow-card) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <Icon size={20} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {duration}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-slate-600">{blurb}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cyan-700 transition group-hover:gap-2">
        Start
        <ArrowRight size={14} />
      </span>
    </button>
  );
}

function SensorEnableCard({
  icon,
  label,
  description,
  status,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  status: SensorState;
  onToggle: () => void;
}) {
  const live = status === "live";
  const requesting = status === "requesting" || status === "loading";
  return (
    <div
      className={cx(
        "rounded-2xl border p-4 shadow-(--shadow-soft) transition-colors",
        live
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            live ? "bg-emerald-100 text-emerald-700" : "bg-slate-50 text-slate-600",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          <div className="truncate text-xs text-slate-500">{description}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={requesting}
        className={cx(
          "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60",
          live
            ? "border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
            : "bg-slate-900 text-white hover:bg-slate-800",
        )}
      >
        {requesting
          ? "Requesting…"
          : live
            ? "Tap to turn off"
            : `Enable ${label.toLowerCase()}`}
      </button>
    </div>
  );
}

function countActive(status: SensorStatus): number {
  let n = 0;
  if (status.geo === "live") n += 1;
  if (status.motion === "live") n += 1;
  if (status.camera === "live") n += 1;
  return n;
}

function ShortcutCard({
  icon: Icon,
  title,
  blurb,
  onClick,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:border-cyan-200"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition group-hover:bg-cyan-50 group-hover:text-cyan-700">
        <Icon size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{blurb}</div>
      </div>
      <ArrowRight size={14} className="text-slate-400 transition group-hover:text-slate-600" aria-hidden />
    </button>
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

function useTodayReminders(reminders: ReadonlyArray<CareReminder>): CareReminder[] {
  return [...reminders].sort((a, b) => a.time.localeCompare(b.time));
}

