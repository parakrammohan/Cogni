import { motion } from "framer-motion";
import { ArrowLeft, AudioLines, Brain, Calculator, Lightbulb, Sparkles, VolumeX } from "lucide-react";
import { useState, type ComponentType, type SVGProps } from "react";

import MatchingPairsGame from "../../components/panels/MatchingPairsGame";
import MemoryGame from "../../components/panels/MemoryGame";
import QuickMathGame from "../../components/panels/QuickMathGame";
import WordAssociationGame from "../../components/panels/WordAssociationGame";
import { Button } from "../../components/ui/Button";
import { Switch } from "../../components/ui/Switch";
import { cx } from "../../lib/utils";
import type { GameSession } from "../../types/app";

type GameId =
  | "core" // The 3-tab MemoryGame hub (Sequence / Patterns / Search)
  | "matching"
  | "math"
  | "association";

interface CognitiveSceneProps {
  onSessionRecorded: (session: GameSession) => void;
  voiceEnabled: boolean;
  onVoiceEnabledChange: (enabled: boolean) => void;
}

interface GameMeta {
  id: GameId;
  title: string;
  blurb: string;
  duration: string;
  domain: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
}

const MORE_GAMES: GameMeta[] = [
  {
    id: "matching",
    title: "Matching pairs",
    blurb: "Concentration — find every pair of symbols.",
    duration: "1–3 min",
    domain: "Working memory",
    icon: Sparkles,
  },
  {
    id: "math",
    title: "Quick math",
    blurb: "Eight rounds of mental arithmetic, escalating in difficulty.",
    duration: "2 min",
    domain: "Processing speed",
    icon: Calculator,
  },
  {
    id: "association",
    title: "Word association",
    blurb: "Pick the word that most naturally goes with the prompt.",
    duration: "1 min",
    domain: "Semantic memory",
    icon: Lightbulb,
  },
];

export function CognitiveScene({
  onSessionRecorded,
  voiceEnabled,
  onVoiceEnabledChange,
}: CognitiveSceneProps) {
  const [active, setActive] = useState<GameId>("core");

  if (active !== "core") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={14} />}
            onClick={() => setActive("core")}
          >
            Back to games
          </Button>
        </div>
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {active === "matching" ? <MatchingPairsGame /> : null}
          {active === "math" ? <QuickMathGame /> : null}
          {active === "association" ? <WordAssociationGame /> : null}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            Games
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
            Short cognitive exercises mapped to the domains targeted in older-adult research.
            Play one a day to track a baseline.
          </p>
        </div>
        <label className="inline-flex items-center gap-3 self-start rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
            {voiceEnabled ? <AudioLines size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-900">Voice prompts</span>
            <span className="block text-[11px] text-slate-500">
              {voiceEnabled ? "On — narrates instructions" : "Off — silent"}
            </span>
          </span>
          <Switch
            checked={voiceEnabled}
            onCheckedChange={onVoiceEnabledChange}
            aria-label="Voice prompts"
          />
        </label>
      </header>

      <MemoryGame onSessionRecorded={onSessionRecorded} voiceEnabled={voiceEnabled} />

      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            <Brain size={14} className="text-slate-400" />
            More games
          </div>
          <span className="text-xs text-slate-500">{MORE_GAMES.length} additional</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_GAMES.map((game) => (
            <GameCard key={game.id} game={game} onOpen={() => setActive(game.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function GameCard({ game, onOpen }: { game: GameMeta; onOpen: () => void }) {
  const Icon = game.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "group flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-(--shadow-soft) transition",
        "hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-(--shadow-card) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
      )}
    >
      <div className="flex w-full items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <Icon size={18} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {game.duration}
        </span>
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{game.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{game.blurb}</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
        {game.domain}
      </span>
    </button>
  );
}
