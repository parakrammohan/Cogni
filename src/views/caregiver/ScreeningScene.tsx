import { motion } from "framer-motion";
import { Activity, Brain, ClipboardList, ImageIcon } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { BinaryFormCard } from "../../components/screening/BinaryFormCard";
import { MetricsPopover } from "../../components/screening/MetricsPopover";
import { MriUploadCard } from "../../components/screening/MriUploadCard";
import { loadModel } from "../../features/screening/inference";
import {
  ADRESSO_AGITATION_GROUPS,
  ADRESSO_PRESETS,
} from "../../features/screening/schemas/adresso_agitation";
import { ALZHEIMER_TABULAR_GROUPS } from "../../features/screening/schemas/alzheimer_tabular";
import { DEMENTIA_OASIS_GROUPS } from "../../features/screening/schemas/dementia_oasis";
import type { ModelMeta } from "../../features/screening/types";

type TabId = "tabular" | "oasis" | "adresso" | "mri";

interface TabDef {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ size?: number }>;
  hint: string;
  body: ReactNode;
}

const TABS: TabDef[] = [
  {
    id: "tabular",
    label: "Clinical questionnaire",
    shortLabel: "Questionnaire",
    icon: ClipboardList,
    hint: "Lifestyle, vitals, symptoms",
    body: (
      <BinaryFormCard
        modelKey="alzheimer_tabular"
        groups={ALZHEIMER_TABULAR_GROUPS}
        intro={
          <ModelBlurb
            title="Alzheimer's risk from a clinical questionnaire"
            description="Estimates the likelihood of Alzheimer's based on demographics, lifestyle, common health conditions, vitals, and observed cognitive symptoms."
            inputSummary="Fill in what you can measure or observe. Defaults represent a healthy adult around 70 years old — adjust each field to match the patient."
          />
        }
      />
    ),
  },
  {
    id: "oasis",
    label: "Brain volumes",
    shortLabel: "Brain volumes",
    icon: Brain,
    hint: "From an MRI report",
    body: (
      <BinaryFormCard
        modelKey="dementia_oasis"
        groups={DEMENTIA_OASIS_GROUPS}
        intro={
          <ModelBlurb
            title="Dementia signal from MRI-derived brain volumes"
            description="Looks at brain-volume measurements plus a short cognitive score and visit history to estimate whether the visit suggests cognitive impairment."
            inputSummary="Three brain-volume numbers (eTIV, nWBV, ASF) come from the patient's MRI report. Defaults are population medians if you don't have the MRI handy."
          />
        }
      />
    ),
  },
  {
    id: "adresso",
    label: "Daily agitation forecast",
    shortLabel: "Agitation",
    icon: Activity,
    hint: "Activity, sleep, vitals",
    body: (
      <BinaryFormCard
        modelKey="adresso_agitation"
        groups={ADRESSO_AGITATION_GROUPS}
        presets={ADRESSO_PRESETS}
        intro={
          <ModelBlurb
            title="Will today look like an agitation day?"
            description="Looks at a day's worth of activity, sleep, and vital-sign summaries to flag whether the patient is on track for an agitation episode."
            inputSummary="Pick a preset to populate a typical day, then tweak. Set any field to -1 if that sensor wasn't running."
          />
        }
      />
    ),
  },
  {
    id: "mri",
    label: "MRI image",
    shortLabel: "MRI image",
    icon: ImageIcon,
    hint: "Upload a brain scan",
    body: <MriTab />,
  },
];

function MriTab() {
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  useEffect(() => {
    loadModel("alzheimer_mri").then(({ meta }) => setMeta(meta)).catch(() => {});
  }, []);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ModelBlurb
            title="Brain MRI — automated reading"
            description="Sorts an axial brain-MRI slice into one of four broad categories: no dementia, very mild, mild, or moderate. Intended as a quick triage signal, not a clinical read."
            inputSummary="Drop in a single MRI image. The model resizes it to a small grayscale square — the preview shows exactly what the model sees."
          />
        </div>
        <MetricsPopover meta={meta} />
      </div>
      <div className="mt-5">
        <MriUploadCard />
      </div>
    </>
  );
}

export function ScreeningScene() {
  const [active, setActive] = useState<TabId>("tabular");
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
          Risk models
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Screening
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-700">
          Four screening tools you can run on the patient's record.
          Each tab asks for the right kind of input — a questionnaire,
          numbers from an MRI report, a day of sensor data, or an MRI
          image — and produces a risk reading. Tap "How well does it
          work?" on any tab for the validation numbers. This is a
          decision-support aid, not a diagnosis.
        </p>
      </header>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-(--shadow-soft)">
        <TabBar tabs={TABS} active={active} onChange={setActive} />
        <div className="p-5 sm:p-6">
          <motion.div
            key={tab.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {tab.body}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      // Only allow horizontal overflow scroll; the tab pills can poke
      // through vertically because of the active-underline + relative
      // positioning, which otherwise triggers a vertical scrollbar.
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-2 pt-2"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold transition ${
              isActive
                ? "bg-white text-cyan-800"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
            <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 lg:inline">
              {t.hint}
            </span>
            {isActive ? (
              <motion.span
                layoutId="screening-tab-underline"
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-cyan-600"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ModelBlurb({
  title,
  description,
  inputSummary,
}: {
  title: string;
  description: string;
  inputSummary: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="font-display text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{inputSummary}</p>
    </div>
  );
}
