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
import { lazy, Suspense, useState, type RefObject } from "react";

import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/layout/AppShell";
import type { SidebarItem } from "../components/layout/Sidebar";
import type {
  CareContact,
  CareMemory,
  CareReminder,
  PatientProfile,
} from "../features/care/types";
import type { GeofenceSettings } from "../features/location/lib/geofence";
import type { StoredPursuitResult } from "../features/vision/pursuit-analysis";
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
const MapScene = lazy(() =>
  import("./caregiver/MapScene").then((m) => ({ default: m.MapScene })),
);
const ScreeningScene = lazy(() =>
  import("./caregiver/ScreeningScene").then((m) => ({ default: m.ScreeningScene })),
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

const NAV_ITEMS: ReadonlyArray<SidebarItem<Scene>> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "Live status" },
  { id: "alerts", label: "Alerts", icon: Bell, hint: "Notification feed" },
  { id: "gait", label: "Gait", icon: Activity, hint: "Fall risk classifier" },
  { id: "map", label: "Map", icon: MapPinned, hint: "Wandering & dwelling" },
  { id: "vision", label: "Vision", icon: Eye, hint: "Ocular biomarkers" },
  { id: "trends", label: "Cognition", icon: Brain, hint: "Memory trend" },
  { id: "screen", label: "Screening", icon: ClipboardList, hint: "ML risk models" },
  { id: "manage", label: "Manage", icon: UserCog, hint: "Edit the patient's care record" },
  { id: "profile", label: "Profile", icon: User, hint: "Your account" },
];

const TITLES: Record<Scene, { title: string; subtitle?: string }> = {
  overview: { title: "Overview", subtitle: "Live patient status" },
  map: { title: "Map", subtitle: "Wandering & dwelling" },
  alerts: { title: "Notifications", subtitle: "Anomaly feed" },
  gait: { title: "Gait analysis", subtitle: "Fall risk classifier" },
  vision: { title: "Ocular biomarkers", subtitle: "Live mesh + gaze metrics" },
  trends: { title: "Cognitive trends", subtitle: "Memory + reaction over time" },
  screen: { title: "Screening", subtitle: "Run bundled ML risk models" },
  profile: { title: "Profile", subtitle: "Your account" },
  manage: { title: "Manage", subtitle: "Patient profile, contacts, memories, pairing" },
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
  videoRef: RefObject<HTMLVideoElement | null>;
  visionMetrics: VisionMetrics;
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
  geofence,
  onGeofenceChange,
  wanderingActive,
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
  const { user: authUser, logout } = useAuth();

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
      profile={{
        name: authUser?.display_name ?? "",
        username: authUser?.username,
        role: authUser?.role,
        onOpenProfile: () => setScene("profile"),
        onSignOut: () => void logout(),
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={scene}
          className="h-full"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
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
            <Suspense fallback={<SceneSkeleton label="Loading map…" />}>
              <MapScene
                locationAnalysis={locationAnalysis}
                locationScenario={locationScenario}
                geofence={geofence}
                onGeofenceChange={onGeofenceChange}
                wanderingActive={wanderingActive}
              />
            </Suspense>
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

          {scene === "screen" ? (
            <Suspense fallback={<SceneSkeleton label="Loading screening…" />}>
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
  return (
    <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-(--shadow-soft)">
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
        {label}
      </span>
    </div>
  );
}
