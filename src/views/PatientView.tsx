import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Eye,
  Home as HomeIcon,
  ImageIcon,
  MapPinned,
  User,
  Users,
} from "lucide-react";
import { lazy, Suspense, useState, type RefObject } from "react";

import { AppShell } from "../components/layout/AppShell";
import type { SidebarItem } from "../components/layout/Sidebar";
import {
  PatientNotificationsDialog,
  countPatientNotifications,
} from "../components/ui/PatientNotificationsDialog";
import type { CalibrationModel } from "../features/vision/calibration";
import { CameraStage } from "../features/vision/CameraStage";
import type { PursuitResult, StoredPursuitResult } from "../features/vision/pursuit-analysis";
import type {
  CareContact,
  CareMemory,
  CareReminder,
  PatientProfile,
} from "../features/care/types";
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
// opens the map tab.
const MapScene = lazy(() =>
  import("./patient/MapScene").then((m) => ({ default: m.MapScene })),
);

type Scene =
  | "home"
  | "map"
  | "ocular"
  | "cognitive"
  | "people"
  | "memories"
  | "profile";

const NAV_ITEMS: ReadonlyArray<SidebarItem<Scene>> = [
  { id: "home", label: "Home", icon: HomeIcon, hint: "Today's overview" },
  { id: "map", label: "Map", icon: MapPinned, hint: "Where you are" },
  { id: "ocular", label: "Eye check", icon: Eye, hint: "Live mesh + pursuit test" },
  { id: "cognitive", label: "Games", icon: Brain, hint: "Cognitive exercises" },
  { id: "people", label: "People", icon: Users, hint: "Contacts" },
  { id: "memories", label: "Memories", icon: ImageIcon, hint: "Photo gallery" },
  { id: "profile", label: "Profile", icon: User, hint: "Personal details" },
];

const TITLES: Record<Scene, { title: string; subtitle?: string }> = {
  home: { title: "Home", subtitle: "Today's overview" },
  map: { title: "My location", subtitle: "Where you are right now" },
  ocular: { title: "Eye check", subtitle: "Blink, gaze, and pursuit testing" },
  cognitive: { title: "Games", subtitle: "Cognitive exercises" },
  people: { title: "People", subtitle: "Contacts" },
  memories: { title: "Memories", subtitle: "Photo gallery" },
  profile: { title: "Profile", subtitle: "Personal details" },
};

interface PatientViewProps {
  alerts: AppAlert[];
  gameHistory: GameSession[];
  gait: GaitAnalysis;
  handleSessionRecorded: (session: GameSession) => void;
  locationAnalysis: LocationAnalysis;
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

  profile: PatientProfile;
  contacts: CareContact[];
  reminders: CareReminder[];
  memories: CareMemory[];
  onToggleReminder: (id: string) => void;

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
  profile,
  contacts,
  reminders,
  memories,
  onToggleReminder,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenGuide,
  onOpenParameters,
}: PatientViewProps) {
  const [scene, setScene] = useState<Scene>("home");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationCount = countPatientNotifications(reminders);

  const emergencyContact = contacts.find((c) => c.isEmergency);
  void prewarmVisionRuntime; // currently no idle prewarm trigger; kept for future hover prefetch
  void alerts; // anomaly alerts are caregiver-only — patient sees task notifications

  return (
    <AppShell
      items={NAV_ITEMS}
      active={scene}
      onChange={setScene}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={onToggleSidebar}
      badges={notificationCount > 0 ? { home: notificationCount } : undefined}
      modeLabel="Patient"
      notificationCount={notificationCount}
      onBellClick={() => setNotificationsOpen(true)}
      pageTitle={TITLES[scene].title}
      pageSubtitle={TITLES[scene].subtitle}
      onOpenGuide={onOpenGuide}
      onOpenParameters={onOpenParameters}
    >
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
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
                locationAnalysis.outOfBounds
                  ? "Stay near your safe route."
                  : gait.label === "Fall detected"
                    ? "Take a moment — we noticed a possible fall."
                    : gait.label === "High fall risk"
                      ? "Walk carefully and use support if needed."
                      : "Everything looks steady right now."
              }
              onNavigate={setScene}
              hasMemories={memories.length > 0}
              sensorStatus={sensorStatus}
              onToggleGeolocation={onToggleGeolocation}
              onToggleMotion={onToggleMotion}
              onToggleCamera={onToggleCamera}
            />
          ) : null}

          {scene === "map" ? (
            <Suspense fallback={<SceneSkeleton label="Loading map…" />}>
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
            />
          ) : null}

          {scene === "cognitive" ? (
            <CognitiveScene
              onSessionRecorded={handleSessionRecorded}
              voiceEnabled={voiceEnabled}
              onVoiceEnabledChange={onVoiceEnabledChange}
            />
          ) : null}

          {scene === "people" ? <PeopleScene contacts={contacts} /> : null}

          {scene === "memories" ? <MemoriesScene memories={memories} /> : null}

          {scene === "profile" ? (
            <ProfileScene profile={profile} emergencyContact={emergencyContact} />
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
  return (
    <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-(--shadow-soft)">
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
        {label}
      </span>
    </div>
  );
}
