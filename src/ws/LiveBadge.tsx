import { Activity } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useSubjectPatient } from "../hooks/useSubjectPatient";
import { cx } from "../lib/utils";
import { useLiveConnectionStatus, useLiveStream } from "./useLiveStream";

/**
 * Tiny live-status indicator pinned to the top-left.
 *
 * - For a caregiver, shows the WS connection state + the time of the
 *   last `patient_state` message received for the paired patient.
 * - For a patient, just shows the connection state (they're the
 *   publisher, not a receiver).
 */
export function LiveBadge() {
  const { user } = useAuth();
  const status = useLiveConnectionStatus();
  const { patientId } = useSubjectPatient();
  const latest = useLiveStream(user?.role === "caregiver" ? patientId : null);

  if (!user) return null;

  const dotColor: Record<string, string> = {
    idle: "bg-slate-400",
    connecting: "bg-amber-400 animate-pulse",
    open: "bg-emerald-500",
    closed: "bg-slate-400",
    error: "bg-red-500",
  };

  const ageSec = latest?.ts ? Math.max(0, Math.round((Date.now() - new Date(latest.ts as string).getTime()) / 1000)) : null;

  return (
    <div className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur">
      <span className={cx("h-2 w-2 rounded-full", dotColor[status] ?? "bg-slate-400")} />
      <Activity size={12} className="text-slate-400" />
      <span className="capitalize">{status}</span>
      {user.role === "caregiver" && latest && ageSec !== null && (
        <span className="text-slate-500">· last {ageSec}s ago</span>
      )}
    </div>
  );
}
