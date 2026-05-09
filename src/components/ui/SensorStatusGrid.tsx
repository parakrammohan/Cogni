import { Activity, Camera, Cpu, MapPinned } from "lucide-react";

import { cx } from "../../lib/utils";
import type { SensorState, SensorStatus } from "../../types/app";

interface SensorStatusGridProps {
  sensorStatus: SensorStatus;
  /** @deprecated visual is light by default now */
  light?: boolean;
}

const SENSOR_META = {
  geo: { icon: MapPinned, label: "Location", description: "GPS / safe-zone watch" },
  motion: { icon: Activity, label: "Motion", description: "Gait & fall variance" },
  camera: { icon: Camera, label: "Camera", description: "Ocular capture device" },
  vision: { icon: Cpu, label: "Vision runtime", description: "MediaPipe face mesh" },
} as const;

function statusLabel(status: SensorState): string {
  switch (status) {
    case "live":
      return "Live";
    case "loading":
      return "Loading";
    case "requesting":
      return "Requesting";
    case "offline":
      return "Standby";
    default:
      return "Ready";
  }
}

function statusClasses(status: SensorState): string {
  if (status === "live") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "loading" || status === "requesting")
    return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "offline") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-slate-200 bg-white text-slate-700";
}

export default function SensorStatusGrid({ sensorStatus }: SensorStatusGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(SENSOR_META).map(([key, meta]) => {
        const Icon = meta.icon;
        const status = sensorStatus[key as keyof SensorStatus];

        return (
          <div
            key={key}
            className={cx(
              "flex items-start gap-3 rounded-2xl border p-4 transition",
              statusClasses(status),
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-slate-700 shadow-sm">
              <Icon size={18} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
                {meta.label}
              </div>
              <div className="mt-0.5 text-base font-semibold">{statusLabel(status)}</div>
              <div className="mt-1 text-xs opacity-75">{meta.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
