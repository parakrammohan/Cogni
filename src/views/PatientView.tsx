import { AnimatePresence, motion } from "framer-motion";
import { Activity, Brain, Camera, Eye, Home, MapPinned, Target } from "lucide-react";
import { useState, type RefObject } from "react";

import { BottomNav, type BottomNavItem } from "../components/layout/BottomNav";
import { Button } from "../components/ui/Button";
import { CameraStage } from "../features/vision/CameraStage";
import { cx } from "../lib/utils";
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
import { HomeScene } from "./patient/HomeScene";
import { OcularScene } from "./patient/OcularScene";
import { PursuitScene } from "./patient/PursuitScene";

type Scene = "home" | "ocular" | "pursuit" | "cognitive";

const NAV_ITEMS: ReadonlyArray<BottomNavItem<Scene>> = [
  { id: "home", label: "Home", icon: Home },
  { id: "ocular", label: "Eye check", icon: Eye },
  { id: "pursuit", label: "Pursuit", icon: Target },
  { id: "cognitive", label: "Memory", icon: Brain },
];

interface PatientViewProps {
  alerts: AppAlert[];
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
}

export default function PatientView({
  alerts,
  gait,
  handleSessionRecorded,
  locationAnalysis,
  onToggleCamera,
  onToggleGeolocation,
  onToggleMotion,
  patientStatus,
  prewarmVisionRuntime,
  safeZone,
  sensorStatus,
  videoRef,
  canvasRef,
  visionMetrics,
  voiceEnabled,
}: PatientViewProps) {
  const [scene, setScene] = useState<Scene>("home");

  const cameraNeeded = scene === "ocular" || scene === "pursuit";

  return (
    <div className="pb-24 lg:pb-0 lg:pr-28">
      {/* Sensor toolbar — only shows on home, slim on small screens */}
      {scene === "home" ? (
        <SensorRow
          sensorStatus={sensorStatus}
          onToggleGeolocation={onToggleGeolocation}
          onToggleMotion={onToggleMotion}
          onToggleCamera={onToggleCamera}
          prewarmVisionRuntime={prewarmVisionRuntime}
        />
      ) : null}

      {/* Persistent camera surface — always mounted, only visible on ocular/pursuit */}
      <CameraStage
        videoRef={videoRef}
        canvasRef={canvasRef}
        cameraStatus={sensorStatus.camera}
        visionMetrics={visionMetrics}
        onToggleCamera={onToggleCamera}
        visible={scene === "ocular"}
        intent="hero"
      />

      <div className={cx("relative", scene === "home" && "mt-5")}>
        <AnimatePresence mode="wait">
          {scene === "home" ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <HomeScene
                alerts={alerts}
                gait={gait}
                locationAnalysis={locationAnalysis}
                safeZone={safeZone}
                visionMetrics={visionMetrics}
                patientStatus={patientStatus}
                onNavigate={setScene}
              />
            </motion.div>
          ) : null}

          {scene === "ocular" ? (
            <motion.div
              key="ocular"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              {/* CameraStage is rendered above; OcularScene gets a slot it can describe */}
              <OcularScene
                visionMetrics={visionMetrics}
                cameraStageSlot={null}
              />
            </motion.div>
          ) : null}

          {scene === "pursuit" ? (
            <motion.div
              key="pursuit"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <PursuitScene
                visionMetrics={visionMetrics}
                cameraStatus={sensorStatus.camera}
                onEnableCamera={onToggleCamera}
                onGoToOcular={() => setScene("ocular")}
              />
            </motion.div>
          ) : null}

          {scene === "cognitive" ? (
            <motion.div
              key="cognitive"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <CognitiveScene
                onSessionRecorded={handleSessionRecorded}
                voiceEnabled={voiceEnabled}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Camera-needed warning if user is on a scene that requires it but it's off */}
      {cameraNeeded && sensorStatus.camera !== "live" && scene === "pursuit" ? null : null}

      <BottomNav
        items={NAV_ITEMS}
        active={scene}
        onChange={setScene}
        badges={alerts.length > 0 ? { home: alerts.length } : undefined}
      />
    </div>
  );
}

function SensorRow({
  sensorStatus,
  onToggleGeolocation,
  onToggleMotion,
  onToggleCamera,
  prewarmVisionRuntime,
}: {
  sensorStatus: SensorStatus;
  onToggleGeolocation: () => void;
  onToggleMotion: () => void;
  onToggleCamera: () => void;
  prewarmVisionRuntime: () => Promise<void>;
}) {
  return (
    <div className="-mx-1 mb-1 flex gap-2 overflow-x-auto pb-2 sm:mx-0 sm:pb-0">
      <SensorPill
        active={sensorStatus.geo === "live"}
        label="GPS"
        icon={<MapPinned size={14} />}
        onClick={onToggleGeolocation}
      />
      <SensorPill
        active={sensorStatus.motion === "live"}
        label="Motion"
        icon={<Activity size={14} />}
        onClick={onToggleMotion}
      />
      <div
        onMouseEnter={() => void prewarmVisionRuntime()}
        onFocus={() => void prewarmVisionRuntime()}
      >
        <SensorPill
          active={sensorStatus.camera === "live"}
          label="Camera"
          icon={<Camera size={14} />}
          onClick={onToggleCamera}
        />
      </div>
    </div>
  );
}

function SensorPill({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={active ? "primary" : "secondary"}
      size="sm"
      icon={icon}
      className={cx(
        "shrink-0 rounded-full",
        active && "bg-emerald-600 text-white hover:bg-emerald-500",
      )}
      aria-pressed={active}
    >
      {label} {active ? "live" : "off"}
    </Button>
  );
}
