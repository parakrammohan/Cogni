import { Activity, Camera, Cpu, MapPinned } from "lucide-react";

import { cx } from "../../lib/utils";
import type { SensorStatus } from "../../types/app";

interface SensorStatusGridProps {
  sensorStatus: SensorStatus;
  light?: boolean;
}

const SENSOR_META = {
  geo: {
    icon: MapPinned,
    label: "Location",
  },
  motion: {
    icon: Activity,
    label: "Motion",
  },
  camera: {
    icon: Camera,
    label: "Camera",
  },
  vision: {
    icon: Cpu,
    label: "Vision runtime",
  },
} as const;

function toneClasses(status: SensorStatus[keyof SensorStatus]) {
  if (status === "live") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  if (status === "loading" || status === "requesting") {
    return "border-cyan/30 bg-cyan/10 text-cyan";
  }
  return "border-white/10 bg-white/6 text-slate-200";
}

function statusLabel(status: SensorStatus[keyof SensorStatus]) {
  if (status === "live") return "Live";
  if (status === "loading") return "Loading";
  if (status === "requesting") return "Requesting";
  if (status === "offline") return "Standby";
  return "Ready";
}

export default function SensorStatusGrid({ sensorStatus, light = false }: SensorStatusGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(SENSOR_META).map(([key, meta]) => {
        const Icon = meta.icon;
        const status = sensorStatus[key as keyof SensorStatus];

        return (
          <div
            key={key}
            className={cx(
              "rounded-[22px] border p-4",
              light ? "border-slate-300 bg-white/80" : toneClasses(status),
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  "flex h-11 w-11 items-center justify-center rounded-2xl",
                  light ? "bg-slate-100 text-ink" : "bg-slate-950/40",
                )}
              >
                <Icon size={18} />
              </div>
              <div>
                <div
                  className={cx(
                    "text-[11px] uppercase tracking-[0.28em]",
                    light ? "text-slate-500" : "text-slate-400",
                  )}
                >
                  {meta.label}
                </div>
                <div className={cx("mt-1 text-base font-semibold", light ? "text-ink" : "text-white")}>
                  {statusLabel(status)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
