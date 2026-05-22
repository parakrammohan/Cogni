import { AlertTriangle, ArrowRight, Brain, Eye, Footprints, MapPinned, Wifi, WifiOff } from "lucide-react";
import type { ComponentType } from "react";
import AlertsPanel from "../../components/panels/AlertsPanel";
import { Avatar } from "../../components/ui/Avatar";
import StatusBoard from "../../components/ui/StatusBoard";
import { useSubjectPatient } from "../../hooks/useSubjectPatient";
import { useLiveConnectionStatus, useLiveStream } from "../../ws/useLiveStream";
import type { PatientProfile } from "../../features/care/types";
import type { AppAlert, GameSession } from "../../types/app";
import { pointInPolygon, type GeofenceSettings } from "../../features/location/lib/geofence";
import { useTranslation } from "react-i18next";
type Scene = "overview" | "map" | "alerts" | "gait" | "vision" | "trends" | "manage";
interface OverviewSceneProps {
  profile: PatientProfile;
  alerts: AppAlert[];
  gameHistory: GameSession[];
  /** Caregiver-local geofence zones. The polygon check happens here
   *  (NOT on the patient — the patient device doesn't see the
   *  caregiver-drawn zones) so the Overview's "Inside / Outside" state
   *  reflects what the caregiver actually configured. */
  geofence: GeofenceSettings;
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
export function OverviewScene({ profile, alerts, gameHistory, geofence, onNavigate }: OverviewSceneProps) {
  const { t } = useTranslation();
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
  // Compute the in/out-of-zone status on the caregiver side, using
  // the caregiver-drawn zones the patient device doesn't have. The
  // patient's WS payload also includes an `outOfBounds` flag, but
  // it's computed against the patient's local `geofence.zones`
  // (always empty in practice — zones are caregiver-defined), so
  // trusting it would always show "Inside the safe zone" no matter
  // where the patient actually is.
  const hasZones = geofence.zones.length > 0;
  const insideAnyZone =
    !!liveLocation && hasZones && geofence.zones.some((z) => pointInPolygon(liveLocation, z.polygon));
  const outsideSafeZone = !!liveLocation && hasZones && !insideAnyZone;
  const homeZone = hasZones ? geofence.zones.find((z) => z.isHome) ?? null : null;
  const insideHome =
    !!liveLocation && !!homeZone && pointInPolygon(liveLocation, homeZone.polygon);
  return (
    <div className="space-y-6">
      {/* Big "outside the safe zone" banner. Mounts above every other
          card so a caregiver scrolling past from another tab can't
          miss it. The Location card on the metrics row mirrors the
          same state in detail, but the banner is the at-a-glance
          signal. Only renders when zones are configured AND the
          patient has been seen outside all of them. */}
      {isOnline && outsideSafeZone ? (
        <button
          type="button"
          onClick={() => onNavigate("map")}
          className="flex w-full items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-left shadow-(--shadow-soft) transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-200 text-red-700">
            <AlertTriangle size={20} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-red-700">
              Geofence
            </span>
            <span className="mt-0.5 block font-display text-lg font-semibold leading-tight text-red-900">
              Patient is outside every safe zone
            </span>
            <span className="mt-1 block text-sm leading-5 text-red-800">
              Last seen position is not inside any of the {geofence.zones.length}{" "}
              {geofence.zones.length === 1 ? "configured zone" : "configured zones"}. Tap to open
              the map and check the breadcrumb.
            </span>
          </span>
          <ArrowRight size={18} className="mt-1 shrink-0 text-red-500" aria-hidden />
        </button>
      ) : null}

      {/* Patient header */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft) sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={profile.name} src={profile.photo || undefined} size="lg" hue="cyan" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
                {t("overviewScene.monitoring")}
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${isOnline ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
            >
              {isOnline ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
              {isOnline ? t("overviewScene.patientOnline") : t("overviewScene.patientOffline")}
              {ageSec !== null && isOnline ? ` · ${ageSec}s ago` : ""}
            </span>
            <button
              type="button"
              onClick={() => onNavigate("alerts")}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              {alerts.length} {t("overviewScene.activeAlert")}
              {alerts.length === 1 ? "" : "s"}
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
          label={t("overviewScene.gait")}
          value={isOnline ? liveGaitLabel : t("overviewScene.patientOffline")}
          context={
            isOnline ? `${liveGaitRiskPct}% fall risk` : t("overviewScene.liveFeedUnavailable")
          }
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
          label={t("overviewScene.location")}
          value={
            isOnline
              ? liveLocation
                ? t("overviewScene.tracked")
                : t("overviewScene.permissionOff")
              : t("overviewScene.patientOffline")
          }
          context={
            isOnline
              ? liveLocation
                ? !hasZones
                  ? "No safe zones configured"
                  : outsideSafeZone
                    ? t("overviewScene.outsideTheSafeZone")
                    : insideHome
                      ? `Inside ${homeZone!.name} (home)`
                      : t("overviewScene.insideTheSafeZone")
                : t("overviewScene.patientHasnTGrantedGpsAccess")
              : t("overviewScene.liveFeedUnavailable")
          }
          tone={
            !isOnline
              ? "neutral"
              : liveLocation
                ? !hasZones
                  ? "neutral"
                  : outsideSafeZone
                    ? "warning"
                    : "good"
                : "warning"
          }
          onClick={() => onNavigate("map")}
        />
        <PatientMetric
          icon={Eye}
          label={t("overviewScene.vision")}
          value={
            isOnline
              ? liveVision?.faceDetected
                ? String(liveVision.risk ?? "—")
                : t("overviewScene.cameraOff")
              : t("overviewScene.patientOffline")
          }
          context={
            isOnline
              ? liveVision?.faceDetected
                ? `${(liveVision.blinkRate ?? 0).toFixed(0)} blinks/min`
                : t("overviewScene.patientHasnTEnabledTheCamera")
              : t("overviewScene.liveFeedUnavailable")
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
          label={t("overviewScene.cognition")}
          value={lastSession ? `Span ${lastSession.memorySpan}` : t("overviewScene.noSessionsYet")}
          context={
            lastSession
              ? `${gameHistory.length} session${gameHistory.length === 1 ? "" : "s"} stored`
              : t("overviewScene.awaitingFirstCognitiveGame")
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
            value: isOnline
              ? t("overviewScene.online")
              : ageSec !== null
                ? `Last seen ${ageSec}s ago`
                : t("overviewScene.offline"),
            tone: isOnline ? "good" : "warning",
            detail: isOnline
              ? t("overviewScene.liveStateArrivingEverySecond")
              : t("overviewScene.patientSAppIsClosedOrOfflineOpen"),
          },
          {
            label: "GPS",
            value: isOnline
              ? liveLocation
                ? t("overviewScene.tracking")
                : t("overviewScene.permissionOff")
              : t("overviewScene.patientOffline"),
            tone: !isOnline ? "calm" : liveLocation ? "good" : "warning",
            detail: !isOnline
              ? t("overviewScene.liveFeedUnavailable2")
              : liveLocation
                ? !hasZones
                  ? "No safe zones configured — draw one on the Map tab."
                  : outsideSafeZone
                    ? t("overviewScene.currentlyOutsideTheSafeZone")
                    : insideHome
                      ? `Inside ${homeZone!.name} (home — dwelling alerts paused)`
                      : t("overviewScene.insideTheSafeZone2")
                : t("overviewScene.askThePatientToEnableLocationOnT"),
          },
          {
            label: "Camera",
            value: isOnline
              ? liveVision?.faceDetected
                ? t("overviewScene.faceLocked")
                : t("overviewScene.permissionOff")
              : t("overviewScene.patientOffline"),
            tone: !isOnline ? "calm" : liveVision?.faceDetected ? "good" : "warning",
            detail: !isOnline
              ? t("overviewScene.liveFeedUnavailable2")
              : liveVision?.faceDetected
                ? `EAR ${(liveVision.ear ?? 0).toFixed(2)} · ${(liveVision.blinkRate ?? 0).toFixed(0)} blinks/min`
                : t("overviewScene.askThePatientToEnableCameraOnThe"),
          },
          {
            label: "Cognitive trend",
            value: lastSession ? t("overviewScene.tracked") : t("overviewScene.pending"),
            tone: lastSession ? "good" : "calm",
            detail: lastSession
              ? `Latest span ${lastSession.memorySpan}, reaction ${Math.round(lastSession.avgReaction)}ms.`
              : t("overviewScene.awaitingFirstSequenceRecallSessi"),
          },
        ]}
      />

      {/* Recent activity preview */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t("overviewScene.recentActivity")}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate("alerts")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
          >
            {t("overviewScene.seeAll")} <ArrowRight size={12} aria-hidden />
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
  icon: ComponentType<{
    size?: number;
  }>;
  label: string;
  value: string;
  context: string;
  tone: Tone;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-start gap-2 rounded-2xl border ${TONE_BORDER[tone]} bg-white p-4 text-left shadow-(--shadow-soft) transition hover:-translate-y-0.5 hover:shadow-(--shadow-card)`}
    >
      <div className="flex items-center gap-2 text-slate-500">
        <Icon size={16} />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl">{value}</div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
        {context}
      </div>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 transition group-hover:gap-2">
        {t("overviewScene.open")}
        <ArrowRight size={12} />
      </span>
    </button>
  );
}
