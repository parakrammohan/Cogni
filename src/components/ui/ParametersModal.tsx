import {
  Activity,
  Camera,
  Eye,
  FlaskConical,
  MapPinned,
  Stethoscope,
} from "lucide-react";
import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./Dialog";
import { Switch } from "./Switch";
import type { LocationScenario } from "../../features/location/lib/scenarios";
import type { MotionScenario } from "../../features/motion/lib/motion-simulation";
import type { VisionMetrics } from "../../features/vision/types";
import { cx, formatMeters } from "../../lib/utils";
import type { GaitAnalysis, LocationAnalysis, SensorStatus } from "../../types/app";

interface ParametersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  simulationsEnabled: boolean;
  onSimulationsEnabledChange: (enabled: boolean) => void;

  locationScenario: LocationScenario;
  onLocationScenarioChange: (scenario: LocationScenario) => void;

  motionScenario: MotionScenario;
  onMotionScenarioChange: (scenario: MotionScenario) => void;

  /** Live sensor state for the diagnostics readout. */
  sensorStatus: SensorStatus;
  visionMetrics: VisionMetrics;
  gait: GaitAnalysis;
  locationAnalysis: LocationAnalysis;
  motionSampleCount: number;
  pursuitSessionCount: number;
  cognitiveSessionCount: number;

  onResetData: () => void;
}

/**
 * Operator parameters modal. Acts as the demo's "backend":
 *   - View mode (Patient / Caregiver) — replaces the old top-bar toggle
 *   - Simulation scenarios for location and motion
 *   - Settings (voice, reset)
 *
 * Triggered from the floating bottom-right "Parameters" button.
 */
export function ParametersModal({
  open,
  onOpenChange,
  simulationsEnabled,
  onSimulationsEnabledChange,
  locationScenario,
  onLocationScenarioChange,
  motionScenario,
  onMotionScenarioChange,
  sensorStatus,
  visionMetrics,
  gait,
  locationAnalysis,
  motionSampleCount,
  pursuitSessionCount,
  cognitiveSessionCount,
  onResetData,
}: ParametersModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        closeLabel="Close parameters"
        className="max-w-xl gap-6"
      >
        <header className="flex flex-col gap-1">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-700">
            <FlaskConical size={12} aria-hidden />
            Operator parameters
          </div>
          <DialogTitle className="font-display text-2xl font-semibold leading-tight text-slate-900">
            Parameters
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Override the simulated sensor streams used when real
            permissions aren&apos;t granted. These controls are only
            visible to operators — not part of the patient flow.
          </DialogDescription>
        </header>

        <Section
          title="Sensor simulation"
          description="Off by default. Turn on to drive the app with synthetic sensor data when no real permissions are granted."
        >
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                {simulationsEnabled ? "Simulations on" : "Simulations off"}
              </div>
              <div className="text-xs leading-5 text-slate-500">
                {simulationsEnabled
                  ? "Synthetic GPS, gait, and gaze streams are running."
                  : "Sensors stay idle until real permissions are granted."}
              </div>
            </div>
            <Switch
              checked={simulationsEnabled}
              onCheckedChange={onSimulationsEnabledChange}
              aria-label="Enable simulations"
            />
          </div>
          <div
            className={cx(
              "grid gap-3 transition",
              simulationsEnabled ? "opacity-100" : "pointer-events-none opacity-50",
            )}
            aria-hidden={!simulationsEnabled}
          >
            <ScenarioField
              icon={<MapPinned size={14} />}
              label="Location route"
              value={locationScenario}
              onChange={(v) => onLocationScenarioChange(v as LocationScenario)}
              options={[
                {
                  value: "home",
                  label: "Home loop",
                  description: "Calm circulation around the safe zone",
                },
                {
                  value: "pacing",
                  label: "Corridor pacing",
                  description: "Back-and-forth in a long hallway",
                },
                {
                  value: "dwelling",
                  label: "Prolonged dwelling",
                  description: "Stuck outside the safe zone (~15 min)",
                },
              ]}
            />
            <ScenarioField
              icon={<Activity size={14} />}
              label="Motion / gait"
              value={motionScenario}
              onChange={(v) => onMotionScenarioChange(v as MotionScenario)}
              options={[
                { value: "normal", label: "Normal", description: "Steady walking pattern" },
                {
                  value: "shuffling",
                  label: "Shuffling",
                  description: "Reduced lift, lateral drift",
                },
                {
                  value: "fall",
                  label: "Fall event",
                  description: "Spike + post-impact stillness",
                },
              ]}
            />
          </div>
        </Section>

        <Section
          title="Diagnostics"
          description="Live readout of every sensor pipeline. Use this to verify whether data is real or simulated."
        >
          <div className="grid gap-2">
            <DiagnosticRow
              icon={<MapPinned size={14} />}
              label="Location"
              source={describeSource(sensorStatus.geo, simulationsEnabled)}
              tone={sensorTone(sensorStatus.geo)}
              detail={
                locationAnalysis.latest
                  ? `${formatMeters(locationAnalysis.currentDistance)} from safe zone · last fix ${describeTime(locationAnalysis.latest.timestamp)}${locationAnalysis.latest.simulated ? " (simulated)" : ""}`
                  : "No fix yet"
              }
              countLabel="breadcrumbs"
              count={locationAnalysis.breadcrumbTrail.length}
            />
            <DiagnosticRow
              icon={<Activity size={14} />}
              label="Motion"
              source={describeSource(sensorStatus.motion, simulationsEnabled)}
              tone={sensorTone(sensorStatus.motion)}
              detail={`Gait: ${gait.label} · risk ${(gait.riskScore * 100).toFixed(0)}%`}
              countLabel="samples"
              count={motionSampleCount}
            />
            <DiagnosticRow
              icon={<Camera size={14} />}
              label="Camera"
              source={describeSource(sensorStatus.camera, simulationsEnabled)}
              tone={sensorTone(sensorStatus.camera)}
              detail={
                sensorStatus.camera === "live"
                  ? "Stream attached"
                  : "No stream"
              }
            />
            <DiagnosticRow
              icon={<Eye size={14} />}
              label="Vision"
              source={describeVisionSource(visionMetrics, sensorStatus.vision, simulationsEnabled)}
              tone={visionTone(visionMetrics, sensorStatus.vision)}
              detail={
                visionMetrics.faceDetected
                  ? `${visionMetrics.landmarkCount} landmarks · EAR ${visionMetrics.ear.toFixed(2)} · ${visionMetrics.blinkRate.toFixed(0)} blinks/min`
                  : visionMetrics.trackingMode === "camera-search"
                    ? "Camera live, no face yet"
                    : visionMetrics.trackingMode === "simulation"
                      ? "Simulated overlay running"
                      : "No data — camera off, simulations off"
              }
            />
            <DiagnosticRow
              icon={<Stethoscope size={14} />}
              label="Sessions"
              source="Persistent"
              tone="info"
              detail={`${pursuitSessionCount} pursuit · ${cognitiveSessionCount} memory recorded`}
            />
          </div>
        </Section>

        <Section title="Data">
          <button
            type="button"
            onClick={onResetData}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Reset all local data
          </button>
          <p className="text-xs leading-5 text-slate-500">
            Clears the trail, game history, profile, contacts, reminders, memories, and onboarding
            state. Re-seeds defaults.
          </p>
        </Section>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

interface ScenarioOption {
  value: string;
  label: string;
  description: string;
}

type DiagnosticTone = "live" | "sim" | "off" | "info";

function DiagnosticRow({
  icon,
  label,
  source,
  detail,
  tone,
  count,
  countLabel,
}: {
  icon: ReactNode;
  label: string;
  source: string;
  detail: string;
  tone: DiagnosticTone;
  count?: number;
  countLabel?: string;
}) {
  const sourceClasses: Record<DiagnosticTone, string> = {
    live: "border-emerald-200 bg-emerald-50 text-emerald-800",
    sim: "border-amber-200 bg-amber-50 text-amber-800",
    off: "border-slate-200 bg-slate-50 text-slate-600",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{label}</span>
          <span
            className={cx(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              sourceClasses[tone],
            )}
          >
            {source}
          </span>
          {typeof count === "number" ? (
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {count} {countLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-600">{detail}</div>
      </div>
    </div>
  );
}

function describeSource(
  status: SensorStatus[keyof SensorStatus],
  simulationsEnabled: boolean,
): string {
  if (status === "live") return "Live";
  if (status === "requesting") return "Requesting";
  if (status === "loading") return "Loading";
  if (status === "simulation") return simulationsEnabled ? "Simulated" : "Simulated";
  return "Off";
}

function describeVisionSource(
  metrics: VisionMetrics,
  visionStatus: SensorStatus[keyof SensorStatus],
  simulationsEnabled: boolean,
): string {
  if (metrics.trackingMode === "live-mesh") return "Live mesh";
  if (metrics.trackingMode === "camera-search") return "Searching";
  if (metrics.trackingMode === "simulation") return simulationsEnabled ? "Simulated" : "Off";
  if (visionStatus === "loading") return "Loading";
  return "Off";
}

function sensorTone(status: SensorStatus[keyof SensorStatus]): DiagnosticTone {
  if (status === "live") return "live";
  if (status === "simulation") return "sim";
  if (status === "loading" || status === "requesting") return "info";
  return "off";
}

function visionTone(
  metrics: VisionMetrics,
  status: SensorStatus[keyof SensorStatus],
): DiagnosticTone {
  if (metrics.trackingMode === "live-mesh") return "live";
  if (metrics.trackingMode === "camera-search") return "info";
  if (status === "simulation") return "sim";
  return "off";
}

function describeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 1500) return "just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}

function ScenarioField({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<ScenarioOption>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span aria-hidden>{icon}</span>
        {label}
      </div>
      <div className="grid gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cx(
                "flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition",
                active
                  ? "border-cyan-300 bg-white shadow-sm"
                  : "border-transparent bg-white/60 hover:border-slate-200 hover:bg-white",
              )}
            >
              <div className="min-w-0">
                <div
                  className={cx(
                    "text-sm font-semibold",
                    active ? "text-slate-900" : "text-slate-700",
                  )}
                >
                  {option.label}
                </div>
                <div className="text-xs leading-5 text-slate-500">{option.description}</div>
              </div>
              <span
                className={cx(
                  "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition",
                  active ? "border-cyan-600 bg-cyan-600" : "border-slate-300 bg-white",
                )}
                aria-hidden
              >
                {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

