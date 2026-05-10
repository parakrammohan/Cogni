import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  Brain,
  Eye,
  LayoutDashboard,
  MapPinned,
  UserCog,
} from "lucide-react";
import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import { AppShell } from "../components/layout/AppShell";
import type { SidebarItem } from "../components/layout/Sidebar";
import type {
  CareContact,
  CareMemory,
  CareReminder,
  PatientProfile,
} from "../features/care/types";
import type { StoredPursuitResult } from "../features/vision/pursuit-analysis";
import type {
  AppAlert,
  GaitAnalysis,
  GameSession,
  LocationAnalysis,
  MotionSample,
  SafeZone,
  SensorStatus,
  UserView,
  VisionMetrics,
} from "../types/app";
import { AlertsScene } from "./caregiver/AlertsScene";
import { GaitScene } from "./caregiver/GaitScene";
import { ManageScene } from "./caregiver/ManageScene";
import { MapScene } from "./caregiver/MapScene";
import { OverviewScene } from "./caregiver/OverviewScene";
import { TrendsScene } from "./caregiver/TrendsScene";
import { VisionScene } from "./caregiver/VisionScene";

type Scene = "overview" | "map" | "alerts" | "gait" | "vision" | "trends" | "manage";

const NAV_ITEMS: ReadonlyArray<SidebarItem<Scene>> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "Live status" },
  { id: "map", label: "Map", icon: MapPinned, hint: "Wandering & dwelling" },
  { id: "alerts", label: "Alerts", icon: Bell, hint: "Notification feed" },
  { id: "gait", label: "Gait", icon: Activity, hint: "Fall risk classifier" },
  { id: "vision", label: "Vision", icon: Eye, hint: "Ocular biomarkers" },
  { id: "trends", label: "Cognition", icon: Brain, hint: "Memory trend" },
  { id: "manage", label: "Manage", icon: UserCog, hint: "Profile, contacts, memories" },
];

const TITLES: Record<Scene, { title: string; subtitle?: string }> = {
  overview: { title: "Overview", subtitle: "Live patient status" },
  map: { title: "Map", subtitle: "Wandering & dwelling" },
  alerts: { title: "Notifications", subtitle: "Anomaly feed" },
  gait: { title: "Gait analysis", subtitle: "Fall risk classifier" },
  vision: { title: "Ocular biomarkers", subtitle: "Live mesh + gaze metrics" },
  trends: { title: "Cognitive trends", subtitle: "Memory + reaction over time" },
  manage: { title: "Manage", subtitle: "Profile, contacts, memories, reminders" },
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
  onResetSafeZone: () => void;
  onSafeZoneChange: (next: SafeZone) => void;
  onToggleCamera: () => void;
  onToggleGeolocation: () => void;
  onToggleMotion: () => void;
  prewarmVisionRuntime: () => Promise<void>;
  safeZone: SafeZone;
  sensorStatus: SensorStatus;
  setView: Dispatch<SetStateAction<UserView>>;
  setVoiceSettings: Dispatch<SetStateAction<{ voiceEnabled: boolean }>>;
  videoRef: RefObject<HTMLVideoElement | null>;
  visionMetrics: VisionMetrics;
  voiceEnabled: boolean;
  pursuitHistory: StoredPursuitResult[];

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
  onResetSafeZone,
  onSafeZoneChange,
  onToggleCamera,
  onToggleGeolocation,
  onToggleMotion,
  safeZone,
  sensorStatus,
  videoRef,
  visionMetrics,
  pursuitHistory,
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

  return (
    <AppShell
      items={NAV_ITEMS}
      active={scene}
      onChange={setScene}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={onToggleSidebar}
      badges={alerts.length > 0 ? { alerts: alerts.length } : undefined}
      modeLabel="Caregiver"
      notificationCount={alerts.length}
      onBellClick={() => setScene("alerts")}
      pageTitle={TITLES[scene].title}
      pageSubtitle={TITLES[scene].subtitle}
      onOpenGuide={onOpenGuide}
      onOpenParameters={onOpenParameters}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={scene}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {scene === "overview" ? (
            <OverviewScene
              profile={profile}
              alerts={alerts}
              gait={gait}
              gameHistory={gameHistory}
              locationAnalysis={locationAnalysis}
              locationScenario={locationScenario}
              safeZone={safeZone}
              sensorStatus={sensorStatus}
              visionMetrics={visionMetrics}
              onNavigate={setScene}
              onToggleGeolocation={onToggleGeolocation}
              onToggleMotion={onToggleMotion}
              onToggleCamera={onToggleCamera}
            />
          ) : null}

          {scene === "map" ? (
            <MapScene
              locationAnalysis={locationAnalysis}
              locationScenario={locationScenario}
              safeZone={safeZone}
              onResetSafeZone={onResetSafeZone}
              onSafeZoneChange={onSafeZoneChange}
            />
          ) : null}

          {scene === "alerts" ? (
            <AlertsScene
              alerts={alerts}
              clearAlerts={clearAlerts}
              dismissAlert={dismissAlert}
            />
          ) : null}

          {scene === "gait" ? <GaitScene gait={gait} motionSamples={motionSamples} /> : null}

          {scene === "vision" ? (
            <VisionScene
              videoRef={videoRef}
              canvasRef={canvasRef}
              visionMetrics={visionMetrics}
              pursuitHistory={pursuitHistory}
            />
          ) : null}

          {scene === "trends" ? <TrendsScene history={gameHistory} /> : null}

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
