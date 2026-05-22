import { motion } from "framer-motion";
import { Play, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../../lib/utils";
import { useTranslation } from "react-i18next";
interface Bubble {
  id: number;
  number: number;
  x: number; // 0..100 % of stage width
  y: number; // 0..100 % of stage height
  hue: string;
  popped: boolean;
}
const HUES = [
  "from-cyan-300 to-cyan-500",
  "from-violet-300 to-violet-500",
  "from-rose-300 to-rose-500",
  "from-amber-300 to-amber-500",
  "from-emerald-300 to-emerald-500",
  "from-sky-300 to-sky-500",
];
const GOAL = 9;
const STAGE_W = 100;
const STAGE_H = 100;
const MIN_DIST = 22;
function generateBubbles(): Bubble[] {
  const placed: Bubble[] = [];
  let id = 0;
  while (placed.length < GOAL) {
    const x = 12 + Math.random() * (STAGE_W - 24);
    const y = 12 + Math.random() * (STAGE_H - 24);
    const tooClose = placed.some((b) => Math.hypot(b.x - x, b.y - y) < MIN_DIST);
    if (tooClose) continue;
    placed.push({
      id,
      number: id + 1,
      x,
      y,
      hue: HUES[id % HUES.length]!,
      popped: false,
    });
    id += 1;
  }
  // Shuffle the visual ordering so the user can't infer order from layout
  return placed.sort(() => Math.random() - 0.5);
}

/**
 * Bubble Pop — bubbles labeled 1..9 float on the stage. Pop them in
 * ascending order. Tapping the wrong bubble shakes it and resets your
 * "next expected" cursor. Time and mistakes are tracked.
 */
export default function BubblePopGame() {
  const { t } = useTranslation();
  const [bubbles, setBubbles] = useState<Bubble[]>(() => generateBubbles());
  const [next, setNext] = useState(1);
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const completed = next > GOAL;
  const tickRef = useRef<number | null>(null);

  // Timer
  useEffect(() => {
    if (startedAt === null || completed) return;
    tickRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 120);
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, [startedAt, completed]);
  function handleTap(bubble: Bubble) {
    if (completed || bubble.popped) return;
    if (startedAt === null) setStartedAt(Date.now());
    if (bubble.number === next) {
      setBubbles((prev) =>
        prev.map((b) =>
          b.id === bubble.id
            ? {
                ...b,
                popped: true,
              }
            : b,
        ),
      );
      setNext((n) => n + 1);
    } else {
      setMistakes((m) => m + 1);
      setShake(bubble.id);
      window.setTimeout(() => setShake(null), 400);
    }
  }
  function reset() {
    setBubbles(generateBubbles());
    setNext(1);
    setMistakes(0);
    setShake(null);
    setStartedAt(null);
    setElapsedMs(0);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("bubblePopGame.workingMemorySequencing")}
        </div>
        <h3 className="mt-2 font-display text-2xl text-slate-900">
          {t("bubblePopGame.bubblePop")}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("bubblePopGame.popTheBubblesInOrderFrom")} <strong>1</strong> to{" "}
          <strong>{GOAL}</strong>
          {t("bubblePopGame.tapTheWrongOneAndItShakesYouLlNe")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">
            {t("bubblePopGame.next")} {completed ? "✓" : next}
          </Badge>
          <Badge tone={mistakes ? "warning" : "calm"}>{mistakes} mistakes</Badge>
          <Badge tone="info">{(elapsedMs / 1000).toFixed(1)}s</Badge>
          {completed ? <Badge tone="good">{t("bubblePopGame.cleared")}</Badge> : null}
        </div>
        <div className="mt-5">
          <Button icon={completed ? <Play size={14} /> : <RotateCcw size={14} />} onClick={reset}>
            {completed ? t("bubblePopGame.playAgain") : t("bubblePopGame.reshuffle")}
          </Button>
        </div>
        {completed ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <Sparkles size={18} className="shrink-0" aria-hidden />
            <div>
              {t("bubblePopGame.all")} {GOAL} {t("bubblePopGame.poppedIn")}{" "}
              <strong>{(elapsedMs / 1000).toFixed(1)} s</strong> with <strong>{mistakes}</strong>{" "}
              mistake{mistakes === 1 ? "" : "s"}.
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white shadow-(--shadow-soft) sm:aspect-[5/4]">
        {bubbles.map((bubble) => (
          <motion.button
            key={bubble.id}
            type="button"
            onClick={() => handleTap(bubble)}
            disabled={bubble.popped || completed}
            aria-label={`Bubble ${bubble.number}`}
            initial={{
              scale: 0,
              opacity: 0,
            }}
            animate={{
              scale: bubble.popped ? 0 : 1,
              opacity: bubble.popped ? 0 : 1,
              x: shake === bubble.id ? [0, -6, 6, -4, 4, 0] : 0,
            }}
            transition={{
              scale: {
                type: "spring",
                stiffness: 320,
                damping: 20,
              },
              x: {
                duration: 0.4,
              },
            }}
            style={{
              left: `${bubble.x}%`,
              top: `${bubble.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            className={cx(
              "absolute h-16 w-16 rounded-full text-white text-xl font-bold shadow-lg transition-transform sm:h-20 sm:w-20 sm:text-2xl",
              "bg-gradient-to-br",
              bubble.hue,
              "border-2 border-white/40 hover:scale-105",
              bubble.popped && "pointer-events-none",
            )}
          >
            {bubble.number}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
