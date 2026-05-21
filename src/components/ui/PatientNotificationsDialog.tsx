import { Bell, BellOff, Check, Clock, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./Dialog";
import { cx, relativeTime } from "../../lib/utils";
import type { CareReminder } from "../../features/care/types";
import type { GameSession } from "../../types/app";
import { useTranslation } from "react-i18next";
interface PatientNotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminders: ReadonlyArray<CareReminder>;
  gameHistory: ReadonlyArray<GameSession>;
}
interface NotificationItem {
  id: string;
  kind: "reminder-due" | "reminder-done" | "session";
  title: string;
  message: string;
  at: number;
}
const UPCOMING_WINDOW_MS = 30 * 60 * 1000;
const OVERDUE_GRACE_MS = 60 * 60 * 1000;
export function PatientNotificationsDialog({
  open,
  onOpenChange,
  reminders,
  gameHistory,
}: PatientNotificationsDialogProps) {
  const { t } = useTranslation();
  const items = derive(reminders, gameHistory);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose closeLabel="Close notifications" className="max-w-md gap-4">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
            <Bell size={18} aria-hidden />
          </span>
          <div>
            <DialogTitle className="font-display text-xl font-semibold text-slate-900">
              {t("patientNotificationsDialog.notifications")}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {t("patientNotificationsDialog.tasksForTodayAndRecentActivity")}
            </DialogDescription>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-50 p-6 text-center">
            <BellOff size={20} className="text-slate-400" aria-hidden />
            <p className="text-sm text-slate-600">
              {t("patientNotificationsDialog.youReAllCaughtUpRemindersAndRece")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
function NotificationRow({ item }: { item: NotificationItem }) {
  const { t } = useTranslation();
  const iconMap = {
    "reminder-due": <Clock size={14} className="text-amber-700" aria-hidden />,
    "reminder-done": <Check size={14} className="text-emerald-700" aria-hidden />,
    session: <Sparkles size={14} className="text-cyan-700" aria-hidden />,
  } as const;
  const surfaceMap = {
    "reminder-due": "border-amber-200 bg-amber-50/60",
    "reminder-done": "border-emerald-200 bg-emerald-50/60",
    session: "border-cyan-200 bg-cyan-50/60",
  } as const;
  return (
    <li className={cx("flex items-start gap-3 rounded-2xl border p-3", surfaceMap[item.kind])}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
        {iconMap[item.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        <div className="text-xs text-slate-600">{item.message}</div>
      </div>
      <span className="text-xs uppercase tracking-wider text-slate-500">
        {relativeTime(item.at)}
      </span>
    </li>
  );
}
function derive(
  reminders: ReadonlyArray<CareReminder>,
  gameHistory: ReadonlyArray<GameSession>,
): NotificationItem[] {
  const now = Date.now();
  const items: NotificationItem[] = [];
  for (const reminder of reminders) {
    const [hh, mm] = reminder.time.split(":");
    const due = new Date();
    due.setHours(Number(hh ?? 0), Number(mm ?? 0), 0, 0);
    const dueMs = due.getTime();
    const diff = dueMs - now;
    if (reminder.completedAt !== null) {
      items.push({
        id: `${reminder.id}-done`,
        kind: "reminder-done",
        title: `Done: ${reminder.label}`,
        message: reminder.notes || "Marked complete.",
        at: reminder.completedAt,
      });
    } else if (diff < UPCOMING_WINDOW_MS && diff > -OVERDUE_GRACE_MS) {
      items.push({
        id: `${reminder.id}-due`,
        kind: "reminder-due",
        title: reminder.label || "Reminder",
        message:
          diff > 0
            ? `In about ${Math.max(1, Math.ceil(diff / 60_000))} minutes — ${reminder.notes || "Due at " + reminder.time}`
            : `Due now (${reminder.time})${reminder.notes ? ` — ${reminder.notes}` : ""}`,
        at: dueMs,
      });
    }
  }
  for (const session of [...gameHistory].reverse().slice(0, 5)) {
    if (session.status === "checkpoint") continue;
    items.push({
      id: `session-${session.id}-${session.createdAt}`,
      kind: "session",
      title: "Memory game logged",
      message: `Span ${session.memorySpan} · ${Math.round(session.avgReaction)}ms avg reaction`,
      at: session.createdAt,
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, 8);
}

/**
 * Count of items considered "actionable" right now — drives the bell badge.
 * Currently: reminders that are due-now or coming up but not yet complete.
 */
export function countPatientNotifications(reminders: ReadonlyArray<CareReminder>): number {
  const now = Date.now();
  let count = 0;
  for (const reminder of reminders) {
    if (reminder.completedAt !== null) continue;
    const [hh, mm] = reminder.time.split(":");
    const due = new Date();
    due.setHours(Number(hh ?? 0), Number(mm ?? 0), 0, 0);
    const diff = due.getTime() - now;
    if (diff < UPCOMING_WINDOW_MS && diff > -OVERDUE_GRACE_MS) count += 1;
  }
  return count;
}
