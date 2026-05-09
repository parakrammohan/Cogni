import { Activity, FlaskConical, MapPinned, ShieldCheck, User } from "lucide-react";
import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./Dialog";
import { Switch } from "./Switch";
import type { LocationScenario } from "../../features/location/lib/scenarios";
import type { MotionScenario } from "../../features/motion/lib/motion-simulation";
import { cx } from "../../lib/utils";
import type { UserView } from "../../types/app";

interface ParametersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  view: UserView;
  onViewChange: (view: UserView) => void;

  simulationsEnabled: boolean;
  onSimulationsEnabledChange: (enabled: boolean) => void;

  locationScenario: LocationScenario;
  onLocationScenarioChange: (scenario: LocationScenario) => void;

  motionScenario: MotionScenario;
  onMotionScenarioChange: (scenario: MotionScenario) => void;

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
  view,
  onViewChange,
  simulationsEnabled,
  onSimulationsEnabledChange,
  locationScenario,
  onLocationScenarioChange,
  motionScenario,
  onMotionScenarioChange,
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
            Switch between the patient and caregiver experiences and override the simulated
            sensor streams. These settings are only visible to operators — not part of the
            patient flow.
          </DialogDescription>
        </header>

        <Section title="View mode" description="Toggle which surface is rendered.">
          <Segmented
            value={view}
            onChange={onViewChange}
            options={[
              {
                value: "patient",
                label: "Patient",
                hint: "Calm, guided",
                icon: <User size={16} />,
              },
              {
                value: "caregiver",
                label: "Caregiver",
                hint: "Operations",
                icon: <ShieldCheck size={16} />,
              },
            ]}
          />
        </Section>

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

interface SegOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

function Segmented<V extends string>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: ReadonlyArray<SegOption<V>>;
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition",
              active
                ? "border-cyan-300 bg-cyan-50 text-slate-900 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
            )}
          >
            <span
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-600",
              )}
              aria-hidden
            >
              {option.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{option.label}</span>
              {option.hint ? (
                <span className="block text-xs text-slate-500">{option.hint}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface ScenarioOption {
  value: string;
  label: string;
  description: string;
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

