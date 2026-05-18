import { ArrowRight, Brain, Eye, Footprints, MapPinned, Wifi, WifiOff } from "lucide-react";
import type { ComponentType } from "react";

import AlertsPanel from "../../components/panels/AlertsPanel";
import { Avatar } from "../../components/ui/Avatar";
import StatusBoard from "../../components/ui/StatusBoard";
import { useSubjectPatient } from "../../hooks/useSubjectPatient";
import { useLiveConnectionStatus, useLiveStream } from "../../ws/useLiveStream";
import type { PatientProfile } from "../../features/care/types";
import type { AppAlert, GameSession } from "../../types/app";

type Scene = "overview" | "map" | "alerts" | "gait" | "vision" | "trends" | "manage";

interface OverviewSceneProps {
  profile: PatientProfile;
  alerts: AppAlert[];
  gameHistory: GameSession[];
  onNavigate: (scene: Scene) => void;
}

interface LiveVision {
  ear?: number;
  blinkRate?: number;
  faceDetected?: boolean;
  risk?: string;
}
interface LiveGait {
  label?: string;
  riskScore?: number;
}
interface LiveLocation {
  lat: number;
  lng: number;
}
interface PatientStateData {
  vision?: LiveVision;
  gait?: LiveGait;
  location?: LiveLocation | null;
  outOfBounds?: boolean;
  wandering?: boolean;
}

export function OverviewScene({
  profile,
  alerts,
  gameHistory,
  onNavigate,
}: OverviewSceneProps) {
  const lastSession = gameHistory.at(-1);
  const wsStatus = useLiveConnectionStatus();
  const { patientId } = useSubjectPatient();
  const livePatient = useLiveStream(patientId);
  const lastSeenMs = livePatient?.ts ? new Date(livePatient.ts as string).getTime() : null;
  const ageSec = lastSeenMs ? Math.max(0, Math.round((Date.now() - lastSeenMs) / 1000)) : null;
  const isOnline = wsStatus === "open" && ageSec !== null && ageSec < 10;

  // Derive everything visible from the WebSocket-pushed patient state.
  // When the patient is offline we deliberately render "Patient offline"
  // instead of stale local-device readings, so caregivers don't mistake
  // their own sensors for the patient's.
  const liveData = (livePatient?.data ?? {}) as PatientStateData;
  const liveVision = liveData.vision;
  const liveGaitLabel = liveData.gait?.label ?? "Idle";
  const liveGaitRiskPct = Math.round(((liveData.gait?.riskScore ?? 0) as number) * 100);
  const liveLocation = liveData.location ?? null;
  const liveOutOfBounds = !!liveData.outOfBounds;

  return (
    <div className="space-y-6">
      {/* Patient header */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft) sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              name={profile.name}
              src={profile.photo || undefined}
              size="lg"
              hue="cyan"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
                Monitoring
              </p>
              <h1 className="mt-0.5 truncate font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
                {profile.name}
              </h1>
              <p className="text-sm text-slate-600">
                {profile.medicalNotes || "No medical notes recorded"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                isOnline
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {isOnline ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
              {isOnline ? "Patient online" : "Patient offline"}
              {ageSec !== null && isOnline ? ` · ${ageSec}s ago` : ""}
            </span>
            <button
              type="button"
              onClick={() => onNavigate("alerts")}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              {alerts.length} active alert{alerts.length === 1 ? "" : "s"}
              <ArrowRight size={12} aria-hidden />
            </button>
            <span className="text-xs text-slate-500">{profile.homeAddress || "—"}</span>
          </div>
        </div>
      </section>

      {/* Quick metrics with navigation — order matches the sidebar
          (Gait → Map → Vision → Cognition). All values come from the
          patient's live WS feed when online; otherwise we show
          "Patient offline" so the caregiver isn't reading data from
          their own device. */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PatientMetric
          icon={Footprints}
          label="Gait"
          value={isOnline ? liveGaitLabel : "Patient offline"}
          context={isOnline ? `${liveGaitRiskPct}% fall risk` : "Live feed unavailable"}
          tone={
            !isOnline
              ? "neutral"
              : liveGaitLabel === "Fall detected"
                ? "danger"
                : liveGaitLabel === "High fall risk"
                  ? "warning"
                  : "good"
          }
          onClick={() => onNavigate("gait")}
        />
        <PatientMetric
          icon={MapPinned}
          label="Location"
          value={
            isOnline
              ? liveLocation
                ? "Tracked"
                : "Permission off"
              : "Patient offline"
          }
          context={
            isOnline
              ? liveLocation
                ? liveOutOfBounds
                  ? "Outside the safe zone"
                  : "Inside the safe zone"
                : "Patient hasn't granted GPS access"
              : "Live feed unavailable"
          }
          tone={
            !isOnline ? "neutral" : liveLocation ? (liveOutOfBounds ? "warning" : "good") : "warning"
          }
          onClick={() => onNavigate("map")}
        />
        <PatientMetric
          icon={Eye}
          label="Vision"
          value={
            isOnline
              ? liveVision?.faceDetected
                ? String(liveVision.risk ?? "—")
                : "Camera off"
              : "Patient offline"
          }
          context={
            isOnline
              ? liveVision?.faceDetected
                ? `${(liveVision.blinkRate ?? 0).toFixed(0)} blinks/min`
                : "Patient hasn't enabled the camera"
              : "Live feed unavailable"
          }
          tone={
            !isOnline
              ? "neutral"
              : !liveVision?.faceDetected
                ? "warning"
                : liveVision.risk === "High"
                  ? "danger"
                  : liveVision.risk === "Moderate"
                    ? "warning"
                    : "good"
          }
          onClick={() => onNavigate("vision")}
        />
        <PatientMetric
          icon={Brain}
          label="Cognition"
          value={lastSession ? `Span ${lastSession.memorySpan}` : "No sessions yet"}
          context={
            lastSession
              ? `${gameHistory.length} session${gameHistory.length === 1 ? "" : "s"} stored`
              : "Awaiting first cognitive game"
          }
          tone={lastSession ? "good" : "neutral"}
          onClick={() => onNavigate("trends")}
        />
      </section>

      {/* Status board. Lists the actually-meaningful signals only — the
          old internal vision-pipeline pills (tracker mode, face lock,
          landmark count) were noise to a caregiver. */}
      <StatusBoard
        items={[
          {
            label: "Connection",
            value: isOnline ? "Online" : ageSec !== null ? `Last seen ${ageSec}s ago` : "Offline",
            tone: isOnline ? "good" : "warning",
            detail: isOnline
              ? "Live state arriving every second"
              : "Patient's app is closed or offline. Open scenes show the last cached values.",
          },
          {
            label: "GPS",
            value: isOnline ? (liveLocation ? "Tracking" : "Permission off") : "Patient offline",
            tone: !isOnline ? "calm" : liveLocation ? "good" : "warning",
            detail: !isOnline
              ? "Live feed unavailable."
              : liveLocation
                ? liveOutOfBounds
                  ? "Currently outside the safe zone."
                  : "Inside the safe zone."
                : "Ask the patient to enable Location on their device.",
          },
          {
            label: "Camera",
            value: isOnline
              ? liveVision?.faceDetected
                ? "Face locked"
                : "Permission off"
              : "Patient offline",
            tone: !isOnline ? "calm" : liveVision?.faceDetected ? "good" : "warning",
            detail: !isOnline
              ? "Live feed unavailable."
              : liveVision?.faceDetected
                ? `EAR ${(liveVision.ear ?? 0).toFixed(2)} · ${(liveVision.blinkRate ?? 0).toFixed(0)} blinks/min`
                : "Ask the patient to enable Camera on their device.",
          },
          {
            label: "Cognitive trend",
            value: lastSession ? "Tracked" : "Pending",
            tone: lastSession ? "good" : "calm",
            detail: lastSession
              ? `Latest span ${lastSession.memorySpan}, reaction ${Math.round(lastSession.avgReaction)}ms.`
              : "Awaiting first sequence-recall session.",
          },
        ]}
      />

      {/* Recent activity preview */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent activity
          </h2>
          <button
            type="button"
            onClick={() => onNavigate("alerts")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
          >
            See all <ArrowRight size={12} aria-hidden />
          </button>
        </div>
        <AlertsPanel alerts={alerts.slice(0, 4)} />
      </section>
    </div>
  );
}

type Tone = "good" | "warning" | "danger" | "neutral";

const TONE_BORDER: Record<Tone, string> = {
  good: "border-slate-200",
  warning: "border-amber-200",
  danger: "border-red-200",
  neutral: "border-slate-200 opacity-80",
};

const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-slate-400",
};

function PatientMetric({
  icon: Icon,
  label,
  value,
  context,
  tone,
  onClick,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  context: string;
  tone: Tone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-start gap-2 rounded-2xl border ${TONE_BORDER[tone]} bg-white p-4 text-left shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:shadow-(--shadow-card)`}
    >
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
        {value}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
        {context}
      </div>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 transition group-hover:gap-2">
        Open
        <ArrowRight size={12} />
      </span>
    </button>
  );
}
