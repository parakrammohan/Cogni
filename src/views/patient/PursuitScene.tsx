import { Camera, Target } from "lucide-react";

import SmoothPursuitTest from "../../components/SmoothPursuitTest";
import { Button } from "../../components/ui/Button";
import type { VisionMetrics } from "../../features/vision/types";
import type { PursuitResult } from "../../features/vision/pursuit-analysis";

interface PursuitSceneProps {
  visionMetrics: VisionMetrics;
  cameraStatus: string;
  onEnableCamera: () => void;
  onGoToOcular: () => void;
  onTestComplete: (result: PursuitResult) => void;
  attachStreamTo: (video: HTMLVideoElement | null) => () => void;
}

export function PursuitScene({
  visionMetrics,
  cameraStatus,
  onEnableCamera,
  onGoToOcular,
  onTestComplete,
  attachStreamTo,
}: PursuitSceneProps) {
  const live = cameraStatus === "live";
  const tracking = visionMetrics.irisPosition !== null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Pursuit test
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          Follow the moving target with your eyes for 15 seconds. We measure pursuit gain,
          tracking accuracy, saccade rate, and phase-shift latency — markers used in oculomotor
          research on healthy aging and MCI.
        </p>
      </header>

      {!live ? (
        <CtaCard
          icon={<Camera size={20} aria-hidden />}
          title="Camera needed"
          body="The pursuit test reads your iris position from the camera. Enable it to begin."
          action={
            <Button icon={<Camera size={16} />} onClick={onEnableCamera}>
              Enable camera
            </Button>
          }
        />
      ) : !tracking ? (
        <CtaCard
          icon={<Target size={20} aria-hidden />}
          tone="amber"
          title="Locking onto your face"
          body="Center your face in the Eye Check view, then come back. The test starts as soon as the live mesh is steady."
          action={
            <Button variant="secondary" onClick={onGoToOcular}>
              Open Eye Check
            </Button>
          }
        />
      ) : (
        <SmoothPursuitTest
          irisPosition={visionMetrics.irisPosition}
          onTestComplete={onTestComplete}
          testDuration={15}
          attachStreamTo={attachStreamTo}
        />
      )}
    </div>
  );
}

function CtaCard({
  icon,
  title,
  body,
  action,
  tone = "cyan",
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
  tone?: "cyan" | "amber";
}) {
  const surface =
    tone === "amber"
      ? "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50"
      : "border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50";
  const iconWrap =
    tone === "amber" ? "bg-white text-amber-700" : "bg-white text-cyan-700";
  return (
    <div className={`rounded-3xl border p-6 sm:p-8 ${surface}`}>
      <div className="flex flex-col items-start gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${iconWrap}`}>
          {icon}
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 max-w-md text-sm text-slate-700">{body}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
