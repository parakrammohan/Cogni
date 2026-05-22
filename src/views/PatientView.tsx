import { AnimatePresence, motion } from "framer-motion";
import { Brain, Eye, Home as HomeIcon, ImageIcon, MapPinned, User, Users } from "lucide-react";
import { Suspense, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { lazyWithRetry } from "../lib/chunk-recovery";
import { useAuth } from "../auth/AuthContext";
import { DisplacedDeviceBanner } from "../components/DisplacedDeviceBanner";
import { AppShell } from "../components/layout/AppShell";
import type { SidebarItem } from "../components/layout/Sidebar";
import {
  PatientNotificationsDialog,
  countPatientNotifications,
} from "../components/ui/PatientNotificationsDialog";
import type { CalibrationModel } from "../features/vision/calibration";
import { CameraStage } from "../features/vision/CameraStage";
import type { NormalizedLandmark } from "../features/vision/ear";
import type { Connection } from "../features/vision/overlay";
import type { PursuitResult, StoredPursuitResult } from "../features/vision/pursuit-analysis";
import type { CareContact, CareMemory, CareReminder, PatientProfile } from "../features/care/types";
import type {
  AppAlert,
  GaitAnalysis,
  GameSession,
  LocationAnalysis,
  SafeZone,
  SensorStatus,
  VisionMetrics,
} from "../types/app";
import { CognitiveScene } from "./patient/CognitiveScene";
import { EyeScene } from "./patient/EyeScene";
import { HomeScene } from "./patient/HomeScene";
import { MemoriesScene } from "./patient/MemoriesScene";
import { PeopleScene } from "./patient/PeopleScene";
import { ProfileScene } from "./patient/ProfileScene";

// Lazy-loaded so Leaflet (~167 KiB chunk) isn't fetched until the patient
// opens the map tab. `lazyWithRetry` auto-recovers when a Vercel
// redeploy makes the old chunk filename 404 (the SPA fallback would
// otherwise return index.html with a text/html MIME).
const MapScene = lazyWithRetry(() =>
  import("./patient/MapScene").then((m) => ({
    default: m.MapScene,
  })),
);
type Scene = "home" | "map" | "ocular" | "cognitive" | "people" | "memories" | "profile";

// Nav structure is keyed off scene IDs that don't change. The visible
// labels + hints come from `useTranslation()` at render time so swapping
// language re-renders correctly without remounting the shell.
const NAV_ICONS: Record<Scene, SidebarItem<Scene>["icon"]> = {
  home: HomeIcon,
  map: MapPinned,
  ocular: Eye,
  cognitive: Brain,
  people: Users,
  memories: ImageIcon,
  profile: User,
};
const NAV_ORDER: ReadonlyArray<Scene> = [
  "home",
  "map",
  "ocular",
  "cognitive",
  "people",
  "memories",
  "profile",
];
// Map each scene to its translated label + subtitle. Both come from
// the `nav` / `subtitles` groups in src/i18n/locales/*/common.json.
const NAV_LABEL_KEYS: Record<Scene, string> = {
  home: "nav.home",
  map: "nav.map",
  ocular: "nav.eye",
  cognitive: "nav.cognitive",
  people: "nav.people",
  memories: "nav.memories",
  profile: "nav.profile",
};
const NAV_SUBTITLE_KEYS: Record<Scene, string> = {
  home: "subtitles.home",
  map: "subtitles.map",
  ocular: "subtitles.eye",
  cognitive: "subtitles.cognitive",
  people: "subtitles.people",
  memories: "subtitles.memories",
  profile: "subtitles.profile",
};
interface PatientViewProps {
  alerts: AppAlert[];
  gameHistory: GameSession[];
  gait: GaitAnalysis;
  handleSessionRecorded: (session: GameSession) => void;
  locationAnalysis: LocationAnalysis;
  /** Polygon-aware "patient is outside every drawn safe zone" flag,
   *  computed in App.tsx from the geofence settings. Used here for
   *  the HomeScene status copy. */
  outOfBounds: boolean;
  onToggleCamera: () => void;
  onToggleGeolocation: () => void;
  onToggleMotion: () => void;
  patientStatus: string;
  prewarmVisionRuntime: () => Promise<void>;
  safeZone: SafeZone;
  sensorStatus: SensorStatus;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  visionMetrics: VisionMetrics;
  voiceEnabled: boolean;
  onVoiceEnabledChange: (enabled: boolean) => void;
  onPursuitComplete: (result: PursuitResult) => void;
  pursuitHistory: ReadonlyArray<StoredPursuitResult>;
  gazeCalibration: CalibrationModel | null;
  onGazeCalibrationChange: (model: CalibrationModel) => void;
  implicitSampleCount: number;
  onRefineCalibration: () => void;
  attachStreamTo: (video: HTMLVideoElement | null) => () => void;
  latestLandmarksRef: RefObject<NormalizedLandmark[] | null>;
  getMeshTessellation: () => readonly Connection[] | undefined;
  profile: PatientProfile;
  onProfileChange: (next: PatientProfile) => void;
  contacts: CareContact[];
  reminders: CareReminder[];
  memories: CareMemory[];
  onToggleReminder: (id: string) => void;
  /** Patients can add/edit/delete their own people and memories now —
   *  the backend's PatientAccess dep allows either side to write, so
   *  these setters fire the same TanStack mutations the caregiver
   *  Manage scene uses. */
  onContactsChange: (next: CareContact[]) => void;
  onMemoriesChange: (next: CareMemory[]) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenGuide: () => void;
  onOpenParameters: () => void;
}
export default function PatientView({
  alerts,
  gameHistory,
  gait,
  handleSessionRecorded,
  locationAnalysis,
  outOfBounds,
  onToggleCamera,
  onToggleGeolocation,
  onToggleMotion,
  prewarmVisionRuntime,
  safeZone,
  sensorStatus,
  videoRef,
  canvasRef,
  visionMetrics,
  voiceEnabled,
  onVoiceEnabledChange,
  onPursuitComplete,
  pursuitHistory,
  gazeCalibration,
  onGazeCalibrationChange,
  implicitSampleCount,
  onRefineCalibration,
  attachStreamTo,
  latestLandmarksRef,
  getMeshTessellation,
  profile,
  onProfileChange,
  contacts,
  reminders,
  memories,
  onToggleReminder,
  onContactsChange,
  onMemoriesChange,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenGuide,
  onOpenParameters,
}: PatientViewProps) {
  const [scene, setScene] = useState<Scene>("home");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationCount = countPatientNotifications(reminders);
  const { user: authUser, logout } = useAuth();
  const { t } = useTranslation();
  const emergencyContact = contacts.find((c) => c.isEmergency);
  void prewarmVisionRuntime; // currently no idle prewarm trigger; kept for future hover prefetch
  void alerts; // anomaly alerts are caregiver-only — patient sees task notifications

  // Rebuild nav with translated labels + hints whenever language changes.
  // The `hint` is the small descriptor under each sidebar item; we reuse
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
        notificationCount > 0
          ? {
              home: notificationCount,
            }
          : undefined
      }
      modeLabel={t("auth.rolePatient")}
      notificationCount={notificationCount}
      onBellClick={() => setNotificationsOpen(true)}
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
      {/* Shown only when another patient device has claimed primary
          monitoring; click "Use this device" to take it back. The slim
          live-link offline strip lives inside AppShell — both views
          get it automatically, mounted under the TopBar. */}
      <DisplacedDeviceBanner />
      {/* Persistent camera + canvas — always mounted off-screen so the
          vision inference loop never loses its frame source. EyeScene
          renders its own visible hero camera via `attachStreamTo`. */}
      <CameraStage
        videoRef={videoRef}
        canvasRef={canvasRef}
        cameraStatus={sensorStatus.camera}
        visionMetrics={visionMetrics}
        onToggleCamera={onToggleCamera}
        visible={false}
        intent="hero"
        latestPursuit={pursuitHistory.at(-1) ?? null}
      />

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
          {scene === "home" ? (
            <HomeScene
              profile={profile}
              contacts={contacts}
              reminders={reminders}
              gameHistory={gameHistory}
              onToggleReminder={onToggleReminder}
              gait={gait}
              locationAnalysis={locationAnalysis}
              visionMetrics={visionMetrics}
              patientStatus={
                outOfBounds
                  ? t("patientView.stayNearYourSafeRoute")
                  : gait.label === "Fall detected"
                    ? t("patientView.takeAMomentWeNoticedAPossibleFal")
                    : gait.label === "High fall risk"
                      ? t("patientView.walkCarefullyAndUseSupportIfNeed")
                      : t("patientView.everythingLooksSteadyRightNow")
              }
              onNavigate={setScene}
              hasMemories={memories.length > 0}
              sensorStatus={sensorStatus}
            />
          ) : null}

          {scene === "map" ? (
            <Suspense fallback={<SceneSkeleton label={t("patientView.loadingMap")} />}>
              <MapScene
                analysis={locationAnalysis}
                safeZone={safeZone}
                geoStatus={sensorStatus.geo}
                onEnableLocation={onToggleGeolocation}
              />
            </Suspense>
          ) : null}

          {scene === "ocular" ? (
            <EyeScene
              visionMetrics={visionMetrics}
              cameraStatus={sensorStatus.camera}
              isBlinking={visionMetrics.isBlinking}
              calibration={gazeCalibration}
              onCalibrationComplete={onGazeCalibrationChange}
              onEnableCamera={onToggleCamera}
              onPursuitComplete={onPursuitComplete}
              implicitSampleCount={implicitSampleCount}
              onRefineCalibration={onRefineCalibration}
              attachStreamTo={attachStreamTo}
              sourceCanvasRef={canvasRef}
              latestLandmarksRef={latestLandmarksRef}
              getMeshTessellation={getMeshTessellation}
            />
          ) : null}

          {scene === "cognitive" ? (
            <CognitiveScene
              onSessionRecorded={handleSessionRecorded}
              voiceEnabled={voiceEnabled}
              onVoiceEnabledChange={onVoiceEnabledChange}
            />
          ) : null}

          {scene === "people" ? (
            <PeopleScene contacts={contacts} onContactsChange={onContactsChange} />
          ) : null}

          {scene === "memories" ? (
            <MemoriesScene memories={memories} onMemoriesChange={onMemoriesChange} />
          ) : null}

          {scene === "profile" ? (
            <ProfileScene
              profile={profile}
              emergencyContact={emergencyContact}
              onProfileChange={onProfileChange}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>

      <PatientNotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        reminders={reminders}
        gameHistory={gameHistory}
      />
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
