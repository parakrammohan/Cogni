import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Calculator,
  Grid3x3,
  Lightbulb,
  Sparkles,
  Target as TargetIcon,
  VolumeX,
  Zap,
} from "lucide-react";
import { useState, type ComponentType, type SVGProps } from "react";

import BubblePopGame from "../../components/games/BubblePopGame";
import ReactionLightGame from "../../components/games/ReactionLightGame";
import SimonGame from "../../components/games/SimonGame";
import MatchingPairsGame from "../../components/panels/MatchingPairsGame";
import MemoryGame from "../../components/panels/MemoryGame";
import QuickMathGame from "../../components/panels/QuickMathGame";
import WordAssociationGame from "../../components/panels/WordAssociationGame";
import { Button } from "../../components/ui/Button";
import { cx } from "../../lib/utils";
import type { GameSession } from "../../types/app";

type GameId = "simon" | "reaction" | "bubbles" | "matching" | "math" | "words";
type Surface = "core" | "gallery" | GameId;

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
  category: "play" | "puzzle" | "teaser";
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  accent: string;
}

const GAMES: GameMeta[] = [
  {
    id: "simon",
    title: "Simon",
    blurb: "Watch the colored pads light up — repeat the sequence. Adds one step every round.",
    duration: "Replayable",
    domain: "Working memory",
    category: "play",
    icon: Sparkles,
    accent: "from-violet-400 to-fuchsia-500",
  },
  {
    id: "reaction",
    title: "Reaction light",
    blurb: "Tap as fast as you can when the panel turns green. Records your best run.",
    duration: "30 sec",
    domain: "Processing speed",
    category: "play",
    icon: Zap,
    accent: "from-emerald-400 to-cyan-500",
  },
  {
    id: "bubbles",
    title: "Bubble pop",
    blurb: "Pop the bubbles in order from 1 to 9. Wrong bubbles shake — keep your place.",
    duration: "1 min",
    domain: "Working memory · sequencing",
    category: "play",
    icon: TargetIcon,
    accent: "from-cyan-400 to-sky-500",
  },
  {
    id: "matching",
    title: "Matching pairs",
    blurb: "Concentration — find every matching pair of symbols.",
    duration: "1–3 min",
    domain: "Working memory",
    category: "puzzle",
    icon: Grid3x3,
    accent: "from-rose-400 to-pink-500",
  },
  {
    id: "math",
    title: "Quick math",
    blurb: "Eight rounds of mental arithmetic, escalating in difficulty.",
    duration: "2 min",
    domain: "Processing speed",
    category: "teaser",
    icon: Calculator,
    accent: "from-amber-400 to-orange-500",
  },
  {
    id: "words",
    title: "Word association",
    blurb: "Pick the word that most naturally goes with the prompt.",
    duration: "1 min",
    domain: "Semantic memory",
    category: "teaser",
    icon: Lightbulb,
    accent: "from-yellow-300 to-amber-500",
  },
];

const CATEGORY_LABEL: Record<GameMeta["category"], string> = {
  play: "Quick play",
  puzzle: "Puzzles",
  teaser: "Brain teasers",
};

export function CognitiveScene({
  onSessionRecorded,
  voiceEnabled,
  onVoiceEnabledChange,
}: CognitiveSceneProps) {
  const [surface, setSurface] = useState<Surface>("core");

  if (surface === "gallery") {
    return <Gallery onBack={() => setSurface("core")} onOpen={(id) => setSurface(id)} />;
  }

  if (surface !== "core") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={14} />}
            onClick={() => setSurface("gallery")}
          >
            All games
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSurface("core")}>
            Memory hub
          </Button>
        </div>
        <motion.div
          key={surface}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {surface === "simon" ? <SimonGame /> : null}
          {surface === "reaction" ? <ReactionLightGame /> : null}
          {surface === "bubbles" ? <BubblePopGame /> : null}
          {surface === "matching" ? <MatchingPairsGame /> : null}
          {surface === "math" ? <QuickMathGame /> : null}
          {surface === "words" ? <WordAssociationGame /> : null}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-[min(78vh,800px)] flex-col gap-3">
      {/* Compact header — single row, no big paragraph */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
          Games
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onVoiceEnabledChange(!voiceEnabled)}
            aria-label={voiceEnabled ? "Mute voice prompts" : "Enable voice prompts"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            {voiceEnabled ? <AudioLines size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setSurface("gallery")}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-cyan-600 hover:to-sky-600"
          >
            <Sparkles size={12} aria-hidden /> More games
            <ArrowRight size={12} aria-hidden />
          </button>
        </div>
      </header>

      {/* Memory hub fills the remaining height */}
      <div className="min-h-0 flex-1 overflow-auto">
        <MemoryGame onSessionRecorded={onSessionRecorded} voiceEnabled={voiceEnabled} />
      </div>
    </div>
  );
}

function Gallery({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (id: GameId) => void;
}) {
  const grouped = GAMES.reduce<Record<GameMeta["category"], GameMeta[]>>(
    (acc, game) => {
      acc[game.category] = acc[game.category] ?? [];
      acc[game.category]!.push(game);
      return acc;
    },
    { play: [], puzzle: [], teaser: [] },
  );

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeft size={14} />}
          onClick={onBack}
        >
          Back to Memory Hub
        </Button>
      </div>

      <header className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white p-6 sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-700 backdrop-blur">
          <Sparkles size={12} aria-hidden />
          Games gallery
        </div>
        <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Choose what to play.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700 sm:text-base">
          Quick-play games up top. Puzzles in the middle. Brain teasers at the bottom. Pick
          whatever feels good — they all help in different ways.
        </p>
      </header>

      {(Object.keys(grouped) as Array<GameMeta["category"]>).map((category) => {
        const games = grouped[category];
        if (!games || games.length === 0) return null;
        return (
          <section key={category}>
            <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold uppercase tracking-wider text-slate-500">
              {CATEGORY_LABEL[category]}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => (
                <GameCard key={game.id} game={game} onOpen={() => onOpen(game.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GameCard({ game, onOpen }: { game: GameMeta; onOpen: () => void }) {
  const Icon = game.icon;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cx(
        "group relative flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-(--shadow-soft) transition",
        "hover:border-transparent hover:shadow-(--shadow-elevated) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
      )}
    >
      <span
        aria-hidden
        className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", game.accent)}
      />
      <div className="flex w-full items-start justify-between">
        <span
          className={cx(
            "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md",
            game.accent,
          )}
          aria-hidden
        >
          <Icon size={20} />
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          {game.duration}
        </span>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold text-slate-900">{game.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{game.blurb}</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
        {game.domain}
      </span>
    </motion.button>
  );
}
