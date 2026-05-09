import { HelpCircle, Radar, ShieldCheck, User } from "lucide-react";

import { Button } from "../ui/Button";
import { cx } from "../../lib/utils";
import type { UserView } from "../../types/app";

interface AppHeaderProps {
  view: UserView;
  onViewChange: (view: UserView) => void;
  onOpenGuide: () => void;
}

export function AppHeader({ view, onViewChange, onOpenGuide }: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-(--shadow-soft) md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-sm">
          <Radar size={22} aria-hidden />
        </div>
        <div>
          <div className="font-display text-lg font-semibold leading-tight text-slate-900">
            CogniTrack
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Alzheimer&apos;s detection &amp; care
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ViewToggle view={view} onChange={onViewChange} />
        <Button
          variant="secondary"
          size="md"
          icon={<HelpCircle size={16} />}
          onClick={onOpenGuide}
          aria-label="Open onboarding guide"
        >
          Guide
        </Button>
      </div>
    </header>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: UserView;
  onChange: (view: UserView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Active surface"
      className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
    >
      <ToggleButton
        active={view === "patient"}
        onClick={() => onChange("patient")}
        icon={<User size={16} />}
        label="Patient"
      />
      <ToggleButton
        active={view === "caregiver"}
        onClick={() => onChange("caregiver")}
        icon={<ShieldCheck size={16} />}
        label="Caregiver"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-900",
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
