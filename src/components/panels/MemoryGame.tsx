import { useState } from "react";
import { Aperture, BrainCircuit, Route } from "lucide-react";

import Badge from "../ui/Badge";
import SequenceRecallGame from "./SequenceRecallGame";
import ReasoningGame from "./ReasoningGame";
import VisualSearchGame from "./VisualSearchGame";
import type { GameSession } from "../../types/app";

interface MemoryGameProps {
  onSessionRecorded: (session: GameSession) => void;
  voiceEnabled: boolean;
}

type CognitiveTab = "sequence" | "reasoning" | "speed";

const TAB_META = {
  sequence: {
    label: "Sequence recall",
    icon: BrainCircuit,
    summary: "Working memory with explicit answer drafting and submission.",
  },
  reasoning: {
    label: "Pattern ladder",
    icon: Route,
    summary: "Serial-pattern reasoning inspired by inductive reasoning drills.",
  },
  speed: {
    label: "Target scan",
    icon: Aperture,
    summary: "Visual-search and processing-speed practice with look-alike distractors.",
  },
} satisfies Record<CognitiveTab, { label: string; icon: typeof BrainCircuit; summary: string }>;

export default function MemoryGame({ onSessionRecorded, voiceEnabled }: MemoryGameProps) {
  const [tab, setTab] = useState<CognitiveTab>("sequence");

  return (
    <div className="grid gap-4">
      <div className="rounded-[24px] border border-slate-300 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Evidence-informed cognitive suite</div>
            <h3 className="mt-2 font-display text-3xl text-ink">Working memory, reasoning, and speed practice</h3>
            <p className="mt-3 text-base leading-7 text-slate-600">
              These mini-games are mapped to domains commonly targeted in older-adult cognitive-training research:
              sequence recall, serial reasoning, and visual-search processing speed. They are training-style tasks, not
              clinical diagnosis.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge tone="info">Working memory</Badge>
            <Badge tone="warning">Reasoning</Badge>
            <Badge tone="good">Processing speed</Badge>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {(Object.keys(TAB_META) as CognitiveTab[]).map((key) => {
            const meta = TAB_META[key];
            const Icon = meta.icon;
            const active = tab === key;

            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={
                  active
                    ? "rounded-[22px] border border-ink bg-ink p-4 text-left text-white transition"
                    : "rounded-[22px] border border-slate-300 bg-slate-50 p-4 text-left text-ink transition hover:-translate-y-0.5"
                }
              >
                <div className="flex items-center gap-3">
                  <div className={active ? "rounded-2xl bg-white/10 p-3" : "rounded-2xl bg-white p-3"}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.2em]">{meta.label}</div>
                    <p className={active ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-600"}>
                      {meta.summary}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "sequence" ? (
        <SequenceRecallGame onSessionRecorded={onSessionRecorded} voiceEnabled={voiceEnabled} />
      ) : null}
      {tab === "reasoning" ? <ReasoningGame /> : null}
      {tab === "speed" ? <VisualSearchGame /> : null}
    </div>
  );
}
