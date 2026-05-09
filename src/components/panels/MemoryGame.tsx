import { motion } from "framer-motion";
import { useState } from "react";
import { Aperture, BrainCircuit, Route } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import ReasoningGame from "./ReasoningGame";
import SequenceRecallGame from "./SequenceRecallGame";
import VisualSearchGame from "./VisualSearchGame";
import { cx } from "../../lib/utils";
import type { GameSession } from "../../types/app";

interface MemoryGameProps {
  onSessionRecorded: (session: GameSession) => void;
  voiceEnabled: boolean;
}

type CognitiveTab = "sequence" | "reasoning" | "speed";

interface TabMeta {
  label: string;
  short: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  blurb: string;
}

const TAB_META: Record<CognitiveTab, TabMeta> = {
  sequence: {
    label: "Sequence recall",
    short: "Sequence",
    icon: BrainCircuit,
    blurb: "Working memory · Corsi-style spatial span",
  },
  reasoning: {
    label: "Pattern ladder",
    short: "Patterns",
    icon: Route,
    blurb: "Inductive reasoning · find the next number",
  },
  speed: {
    label: "Target scan",
    short: "Scan",
    icon: Aperture,
    blurb: "Processing speed · find the matching pair",
  },
};

const TAB_ORDER: CognitiveTab[] = ["sequence", "reasoning", "speed"];

export default function MemoryGame({ onSessionRecorded, voiceEnabled }: MemoryGameProps) {
  const [tab, setTab] = useState<CognitiveTab>("sequence");
  const meta = TAB_META[tab];

  return (
    <div className="grid gap-4">
      {/* Compact game switcher — horizontal scroll on mobile */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
        {TAB_ORDER.map((key) => {
          const tabMeta = TAB_META[key];
          const Icon = tabMeta.icon;
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={active}
              className={cx(
                "relative flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
                active
                  ? "border-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="memory-game-active-pill"
                  aria-hidden
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-xl bg-slate-900 shadow-sm"
                />
              ) : null}
              <span className="relative flex items-center gap-2">
                <Icon size={14} aria-hidden />
                <span className="hidden sm:inline">{tabMeta.label}</span>
                <span className="sm:hidden">{tabMeta.short}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-1 text-xs text-slate-500">{meta.blurb}</p>

      {tab === "sequence" ? (
        <SequenceRecallGame onSessionRecorded={onSessionRecorded} voiceEnabled={voiceEnabled} />
      ) : null}
      {tab === "reasoning" ? <ReasoningGame /> : null}
      {tab === "speed" ? <VisualSearchGame /> : null}
    </div>
  );
}
