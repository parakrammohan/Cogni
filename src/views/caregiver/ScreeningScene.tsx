import { motion } from "framer-motion";
import { Activity, Brain, ClipboardList, ImageIcon } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";

import { BinaryFormCard } from "../../components/screening/BinaryFormCard";
import { MriUploadCard } from "../../components/screening/MriUploadCard";
import {
  ADRESSO_AGITATION_GROUPS,
  ADRESSO_PRESETS,
} from "../../features/screening/schemas/adresso_agitation";
import { ALZHEIMER_TABULAR_GROUPS } from "../../features/screening/schemas/alzheimer_tabular";
import { DEMENTIA_OASIS_GROUPS } from "../../features/screening/schemas/dementia_oasis";

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
    hint: "AUC 0.95 · 32 features · GBM",
    body: (
      <BinaryFormCard
        modelKey="alzheimer_tabular"
        groups={ALZHEIMER_TABULAR_GROUPS}
        intro={
          <ModelBlurb
            title="Alzheimer's risk from a 32-feature questionnaire"
            description="Predicts probability of an Alzheimer's diagnosis from demographics, lifestyle, comorbidities, vitals, and observed cognitive symptoms. Trained on 2,149 patients, 5-fold CV accuracy 94.9%, AUC 0.952."
            inputSummary="Fill in what you can measure or observe — defaults represent a healthy 70-year-old reference profile."
          />
        }
      />
    ),
  },
  {
    id: "oasis",
    label: "OASIS / brain volumes",
    shortLabel: "OASIS",
    icon: Brain,
    hint: "AUC 0.89 · 10 features · GBM",
    body: (
      <BinaryFormCard
        modelKey="dementia_oasis"
        groups={DEMENTIA_OASIS_GROUPS}
        intro={
          <ModelBlurb
            title="OASIS longitudinal dementia classifier"
            description="Predicts whether the visit indicates cognitive impairment (Demented or Converted) versus Nondemented. Trained on the OASIS-2 longitudinal cohort (373 visits across 150 subjects). 5-fold CV accuracy 81%, AUC 0.89."
            inputSummary="Inputs cover the OASIS feature set. The three brain-volume metrics (eTIV, nWBV, ASF) come from MRI segmentation — defaults are the dataset medians when no MRI is on hand."
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
    hint: "AUC 0.78 · 41 features · GBM",
    body: (
      <BinaryFormCard
        modelKey="adresso_agitation"
        groups={ADRESSO_AGITATION_GROUPS}
        presets={ADRESSO_PRESETS}
        metricKeys={[
          { key: "groupkfold_auc_mean", label: "GroupKFold AUC" },
          { key: "groupkfold_ap_mean", label: "Avg precision" },
        ]}
        intro={
          <ModelBlurb
            title="TIHM 1.5 — agitation event forecast"
            description="From a single day's smart-home + wearable + sleep aggregates, predicts whether an agitation event will be recorded. Trained on 2,722 patient-days across 56 patients with class-balanced weighting. Held out by patient (no leakage): AUC 0.778, average precision 0.24 at 4.2% prevalence."
            inputSummary="41 sensor aggregates per day. Use a preset to populate plausible values, then tweak. Use -1 in any field if that sensor wasn't running."
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
    hint: "78% test acc · 4-class · MLP",
    body: (
      <>
        <ModelBlurb
          title="Brain MRI 4-class classifier"
          description="Classifies an axial MRI brain slice as NonDemented, VeryMild, Mild, or Moderate Demented. Pipeline: StandardScaler → PCA(128) → MLP. Trained on 12,000 stratified images, 78.2% test accuracy."
          inputSummary="Drop in a single MRI image. The model only sees a 64×64 grayscale crop — the preview shows you exactly what it gets."
        />
        <div className="mt-5">
          <MriUploadCard />
        </div>
      </>
    ),
  },
];

export function ScreeningScene() {
  const [active, setActive] = useState<TabId>("tabular");
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
          Risk models
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Screening
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Four ML models run server-side and write their results to the
          shared patient record. Each tab below has its own input pane —
          a clinical questionnaire, OASIS feature set, daily sensor
          aggregates, or an MRI image. Educational tooling, not a
          diagnosis.
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
            <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 lg:inline">
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
