import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Trophy } from "lucide-react";

import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../../lib/utils";

interface Card {
  id: number;
  symbol: string;
  matched: boolean;
  flipped: boolean;
}

const SYMBOLS_BY_LEVEL: Record<number, string[]> = {
  6: ["🌻", "🐢", "⛵", "🍒", "🎵", "🌙"],
  8: ["🌻", "🐢", "⛵", "🍒", "🎵", "🌙", "🌈", "🍓"],
  12: ["🌻", "🐢", "⛵", "🍒", "🎵", "🌙", "🌈", "🍓", "🎈", "🦋", "🍋", "🐬"],
};

function shuffle<T>(values: T[]): T[] {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function buildDeck(pairs: number): Card[] {
  const symbols = SYMBOLS_BY_LEVEL[pairs] ?? SYMBOLS_BY_LEVEL[6]!;
  return shuffle(
    symbols.flatMap((symbol, idx) => [
      { id: idx * 2, symbol, matched: false, flipped: false },
      { id: idx * 2 + 1, symbol, matched: false, flipped: false },
    ]),
  );
}

/**
 * Concentration / memory match. Tap two cards; if they match they stay open.
 * Tracks moves and time. Adaptive difficulty: 6 / 8 / 12 pairs.
 */
export default function MatchingPairsGame() {
  const [pairs, setPairs] = useState(6);
  const [deck, setDeck] = useState<Card[]>(() => buildDeck(6));
  const [openIds, setOpenIds] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const matched = deck.every((card) => card.matched);
  const grid = useMemo(() => {
    if (pairs <= 6) return "grid-cols-3 sm:grid-cols-4";
    if (pairs <= 8) return "grid-cols-4";
    return "grid-cols-4 sm:grid-cols-6";
  }, [pairs]);

  // Tick the clock while playing.
  useEffect(() => {
    if (startedAt === null || matched) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => window.clearInterval(id);
  }, [startedAt, matched]);

  // When two cards are open, evaluate then close after a short delay.
  useEffect(() => {
    if (openIds.length !== 2) return;
    const [aId, bId] = openIds;
    const a = deck.find((card) => card.id === aId);
    const b = deck.find((card) => card.id === bId);
    if (!a || !b) return;
    if (a.symbol === b.symbol) {
      const id = window.setTimeout(() => {
        setDeck((current) =>
          current.map((card) =>
            card.id === aId || card.id === bId
              ? { ...card, matched: true, flipped: true }
              : card,
          ),
        );
        setOpenIds([]);
      }, 350);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setDeck((current) =>
        current.map((card) =>
          card.id === aId || card.id === bId ? { ...card, flipped: false } : card,
        ),
      );
      setOpenIds([]);
    }, 850);
    return () => window.clearTimeout(id);
  }, [openIds, deck]);

  function handleTap(card: Card) {
    if (card.matched || card.flipped || openIds.length >= 2) return;
    if (startedAt === null) setStartedAt(Date.now());
    setMoves((m) => m + 1);
    setDeck((current) =>
      current.map((c) => (c.id === card.id ? { ...c, flipped: true } : c)),
    );
    setOpenIds((prev) => [...prev, card.id]);
  }

  function reset(nextPairs = pairs) {
    setPairs(nextPairs);
    setDeck(buildDeck(nextPairs));
    setOpenIds([]);
    setMoves(0);
    setStartedAt(null);
    setElapsedMs(0);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Working memory · concentration
        </div>
        <h3 className="mt-2 font-display text-2xl text-slate-900">Matching pairs</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Find every pair. The cards flip back if you tap two that don&apos;t match — your job
          is to remember where each symbol was.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">{pairs} pairs</Badge>
          <Badge tone={moves ? "warning" : "calm"}>{moves} moves</Badge>
          <Badge tone="info">{(elapsedMs / 1000).toFixed(1)}s</Badge>
          {matched ? <Badge tone="good">Solved!</Badge> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[6, 8, 12].map((option) => (
            <Button
              key={option}
              variant={pairs === option ? "primary" : "secondary"}
              size="sm"
              onClick={() => reset(option)}
            >
              {option} pairs
            </Button>
          ))}
          <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => reset()}>
            Reshuffle
          </Button>
        </div>
        {matched ? (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <Trophy size={18} className="shrink-0" aria-hidden />
            <div>
              <strong>Great work!</strong> {moves} moves in{" "}
              {(elapsedMs / 1000).toFixed(1)} seconds.
            </div>
          </div>
        ) : null}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className={cx("grid gap-2", grid)}>
          {deck.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => handleTap(card)}
              disabled={card.flipped || card.matched}
              aria-label={card.flipped ? card.symbol : "Hidden card"}
              className={cx(
                "aspect-[3/4] rounded-2xl border text-3xl font-bold shadow-sm transition sm:text-4xl",
                card.matched
                  ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                  : card.flipped
                    ? "border-cyan-300 bg-white text-slate-900"
                    : "border-slate-200 bg-white text-transparent hover:-translate-y-0.5 hover:bg-slate-100",
              )}
            >
              {card.flipped || card.matched ? card.symbol : "?"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
