import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  Brain,
  ClipboardList,
  Eye,
  LayoutDashboard,
  MapPinned,
  User,
  UserCog,
} from "lucide-react";
import { Suspense, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/layout/AppShell";
import type { SidebarItem } from "../components/layout/Sidebar";
import { useCaregiverPatientLocation } from "../hooks/useCaregiverPatientLocation";
import { usePatientOnline } from "../hooks/usePatientOnline";
import { lazyWithRetry } from "../lib/chunk-recovery";
import type { CareContact, CareMemory, CareReminder, PatientProfile } from "../features/care/types";
import type { CalibrationModel } from "../features/vision/calibration";
import type { GeofenceSettings } from "../features/location/lib/geofence";
import type { NormalizedLandmark } from "../features/vision/ear";
import type { Connection } from "../features/vision/overlay";
import type { PursuitResult, StoredPursuitResult } from "../features/vision/pursuit-analysis";
import type {
  AppAlert,
  GaitAnalysis,
  GameSession,
  LocationAnalysis,
  MotionSample,
  SensorStatus,
  VisionMetrics,
} from "../types/app";
import { AlertsScene } from "./caregiver/AlertsScene";
import { CaregiverProfileScene } from "./caregiver/CaregiverProfileScene";
import { GaitScene } from "./caregiver/GaitScene";
import { ManageScene } from "./caregiver/ManageScene";
import { OverviewScene } from "./caregiver/OverviewScene";
import { TrendsScene } from "./caregiver/TrendsScene";
import { VisionScene } from "./caregiver/VisionScene";

// Lazy-loaded heavy scenes — pulled out of the initial chunk so first paint
// doesn't have to download Leaflet (~167 KiB) or onnxruntime-web (~356 KiB)
// before the caregiver has navigated to those tabs.
const MapScene = lazyWithRetry(() =>
  import("./caregiver/MapScene").then((m) => ({
    default: m.MapScene,
  })),
);
const ScreeningScene = lazyWithRetry(() =>
  import("./caregiver/ScreeningScene").then((m) => ({
    default: m.ScreeningScene,
  })),
);
type Scene =
  | "overview"
  | "map"
  | "alerts"
  | "gait"
  | "vision"
  | "trends"
  | "screen"
  | "profile"
  | "manage";

// Scene icons + ordering are static; labels come from useTranslation()
// at render time so language switches re-render correctly.
const NAV_ICONS: Record<Scene, SidebarItem<Scene>["icon"]> = {
  overview: LayoutDashboard,
  gait: Activity,
  map: MapPinned,
  vision: Eye,
  trends: Brain,
  screen: ClipboardList,
  manage: UserCog,
  profile: User,
  alerts: Bell,
};
const NAV_ORDER: ReadonlyArray<Scene> = [
  "overview",
  "gait",
  "map",
  "vision",
  "trends",
  "screen",
  "manage",
  "profile",
  "alerts",
];
const NAV_LABEL_KEYS: Record<Scene, string> = {
  overview: "nav.overview",
  gait: "nav.gait",
  map: "nav.map",
  vision: "nav.vision",
  trends: "nav.cognitive",
  screen: "nav.screening",
  manage: "nav.manage",
  profile: "nav.profile",
  alerts: "nav.alerts",
};
const NAV_SUBTITLE_KEYS: Record<Scene, string> = {
  overview: "subtitles.overview",
  gait: "subtitles.gait",
  map: "subtitles.map",
  vision: "subtitles.vision",
  trends: "subtitles.trends",
  screen: "subtitles.screening",
  manage: "subtitles.manage",
  profile: "subtitles.profile",
  alerts: "subtitles.alerts",
};
interface CaregiverViewProps {
  alerts: AppAlert[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
  gait: GaitAnalysis;
  gameHistory: GameSession[];
  locationAnalysis: LocationAnalysis;
  locationScenario: string;
  motionSamples: MotionSample[];
  geofence: GeofenceSettings;
  onGeofenceChange: (next: GeofenceSettings) => void;
  wanderingActive: boolean;
  sensorStatus: SensorStatus;
  visionMetrics: VisionMetrics;
  pursuitHistory: StoredPursuitResult[];

  // Vision-pipeline props for the caregiver Self-test (mirrors what
  // PatientView receives so we can reuse EyeScene directly).
  gazeCalibration: CalibrationModel | null;
  onGazeCalibrationChange: (model: CalibrationModel) => void;
  onToggleCamera: () => void;
  onPursuitComplete: (result: PursuitResult) => void;
  implicitSampleCount: number;
  onRefineCalibration: () => void;
  attachStreamTo: (video: HTMLVideoElement | null) => () => void;
  latestLandmarksRef: RefObject<NormalizedLandmark[] | null>;
  getMeshTessellation: () => readonly Connection[] | undefined;
  profile: PatientProfile;
  contacts: CareContact[];
  reminders: CareReminder[];
  memories: CareMemory[];
  onProfileChange: (next: PatientProfile) => void;
  onContactsChange: (next: CareContact[]) => void;
  onRemindersChange: (next: CareReminder[]) => void;
  onMemoriesChange: (next: CareMemory[]) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenGuide: () => void;
  onOpenParameters: () => void;
}
export default function CaregiverView({
  alerts,
  canvasRef,
  clearAlerts,
  dismissAlert,
  gait,
  gameHistory,
  locationAnalysis,
  locationScenario,
  motionSamples,
  geofence,
  onGeofenceChange,
  wanderingActive,
  sensorStatus,
  visionMetrics,
  pursuitHistory,
  gazeCalibration,
  onGazeCalibrationChange,
  onToggleCamera,
  onPursuitComplete,
  implicitSampleCount,
  onRefineCalibration,
  attachStreamTo,
  latestLandmarksRef,
  getMeshTessellation,
  profile,
  contacts,
  reminders,
  memories,
  onProfileChange,
  onContactsChange,
  onRemindersChange,
  onMemoriesChange,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenGuide,
  onOpenParameters,
}: CaregiverViewProps) {
  const [scene, setScene] = useState<Scene>("overview");
  const { user: authUser, logout } = useAuth();
  const { t } = useTranslation();
  // Caregiver Map shows the *patient's* location from the WS feed, not
  // the caregiver's own GPS. Falls back to the caregiver's local
  // locationAnalysis if for some reason the hook returns null.
  const patientLocationAnalysis = useCaregiverPatientLocation();
  const patientOnline = usePatientOnline();
  const effectiveLocationAnalysis = patientLocationAnalysis ?? locationAnalysis;
  // `hint` is the small descriptor under each sidebar label; we reuse
  // the same `subtitles.*` key as the page header so they stay in sync.
  const navItems: SidebarItem<Scene>[] = NAV_ORDER.map((id) => ({
    id,
    label: t(NAV_LABEL_KEYS[id]),
    icon: NAV_ICONS[id],
    hint: t(NAV_SUBTITLE_KEYS[id]),
  }));
  const pageTitle = t(NAV_LABEL_KEYS[scene]);
  const pageSubtitle = t(NAV_SUBTITLE_KEYS[scene]);
  return (
    <AppShell
      items={navItems}
      active={scene}
      onChange={setScene}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={onToggleSidebar}
      badges={
        alerts.length > 0
          ? {
              alerts: alerts.length,
            }
          : undefined
      }
      modeLabel={t("auth.roleCaregiver")}
      logoButterfly={patientOnline}
      notificationCount={alerts.length}
      onBellClick={() => setScene("alerts")}
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      onOpenGuide={onOpenGuide}
      onOpenParameters={onOpenParameters}
      profile={{
        name: authUser?.display_name ?? "",
        username: authUser?.username,
        role: authUser?.role,
        photo: authUser?.photo_url || undefined,
        onOpenProfile: () => setScene("profile"),
        onSignOut: () => void logout(),
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={scene}
          className="h-full"
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
            duration: 0.22,
          }}
        >
          {scene === "overview" ? (
            <OverviewScene
              profile={profile}
              alerts={alerts}
              gameHistory={gameHistory}
              onNavigate={setScene}
            />
          ) : null}

          {scene === "map" ? (
            <Suspense fallback={<SceneSkeleton label={t("caregiverView.loadingMap")} />}>
              <MapScene
                locationAnalysis={effectiveLocationAnalysis}
                locationScenario={locationScenario}
                geofence={geofence}
                onGeofenceChange={onGeofenceChange}
                wanderingActive={wanderingActive}
              />
            </Suspense>
          ) : null}

          {scene === "alerts" ? (
            <AlertsScene alerts={alerts} clearAlerts={clearAlerts} dismissAlert={dismissAlert} />
          ) : null}

          {scene === "gait" ? <GaitScene gait={gait} motionSamples={motionSamples} /> : null}

          {scene === "vision" ? (
            <VisionScene
              canvasRef={canvasRef}
              visionMetrics={visionMetrics}
              pursuitHistory={pursuitHistory}
              cameraStatus={sensorStatus.camera}
              calibration={gazeCalibration}
              onCalibrationComplete={onGazeCalibrationChange}
              onEnableCamera={onToggleCamera}
              onPursuitComplete={onPursuitComplete}
              implicitSampleCount={implicitSampleCount}
              onRefineCalibration={onRefineCalibration}
              attachStreamTo={attachStreamTo}
              latestLandmarksRef={latestLandmarksRef}
              getMeshTessellation={getMeshTessellation}
            />
          ) : null}

          {scene === "trends" ? <TrendsScene history={gameHistory} /> : null}

          {scene === "screen" ? (
            <Suspense fallback={<SceneSkeleton label={t("caregiverView.loadingScreening")} />}>
              <ScreeningScene />
            </Suspense>
          ) : null}

          {scene === "profile" ? <CaregiverProfileScene /> : null}

          {scene === "manage" ? (
            <ManageScene
              profile={profile}
              contacts={contacts}
              reminders={reminders}
              memories={memories}
              onProfileChange={onProfileChange}
              onContactsChange={onContactsChange}
              onRemindersChange={onRemindersChange}
              onMemoriesChange={onMemoriesChange}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
function SceneSkeleton({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-(--shadow-soft)">
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
        {label}
      </span>
    </div>
  );
}
