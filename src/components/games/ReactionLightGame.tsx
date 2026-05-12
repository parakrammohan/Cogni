import { motion } from "framer-motion";
import { RotateCcw, Timer, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../../lib/utils";

type Phase = "idle" | "waiting" | "go" | "result" | "early";

interface Run {
  reactionMs: number;
  recordedAt: number;
}

const HISTORY_LIMIT = 5;

/**
 * Reaction light. The button turns red, then unpredictably flips to green
 * after 1.5–4 seconds — tap as fast as you can. Tapping early counts as a
 * miss (you can't pre-empt the signal).
 *
 * Captures genuine perceptual + motor reaction time, ~190–280ms typical.
 * Trends slower with age and slower in early MCI.
 */
export default function ReactionLightGame() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [reaction, setReaction] = useState<number | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const goAtRef = useRef(0);
  const waitTimerRef = useRef<number | null>(null);

  const best = history.reduce((acc, run) => (acc === null || run.reactionMs < acc ? run.reactionMs : acc), null as number | null);
  const avg =
    history.length === 0
      ? null
      : Math.round(history.reduce((sum, run) => sum + run.reactionMs, 0) / history.length);

  useEffect(
    () => () => {
      if (waitTimerRef.current !== null) clearTimeout(waitTimerRef.current);
    },
    [],
  );

  function start() {
    if (waitTimerRef.current !== null) clearTimeout(waitTimerRef.current);
    setReaction(null);
    setPhase("waiting");
    const delay = 1500 + Math.random() * 2500;
    waitTimerRef.current = window.setTimeout(() => {
      goAtRef.current = performance.now();
      setPhase("go");
    }, delay);
  }

  function tap() {
    if (phase === "waiting") {
      // Pre-empted the signal
      if (waitTimerRef.current !== null) clearTimeout(waitTimerRef.current);
      setPhase("early");
      return;
    }
    if (phase === "go") {
      const elapsed = performance.now() - goAtRef.current;
      setReaction(elapsed);
      setHistory((prev) => [{ reactionMs: elapsed, recordedAt: Date.now() }, ...prev].slice(0, HISTORY_LIMIT));
      setPhase("result");
      return;
    }
    // Idle / result / early — taps start a new run
    start();
  }

  const surface =
    phase === "go"
      ? "bg-emerald-500"
      : phase === "waiting"
        ? "bg-rose-500"
        : phase === "early"
          ? "bg-amber-500"
          : "bg-slate-200";
  const headline =
    phase === "go"
      ? "TAP NOW"
      : phase === "waiting"
        ? "Wait…"
        : phase === "early"
          ? "Too early — tap to retry"
          : phase === "result"
            ? `${Math.round(reaction ?? 0)} ms`
            : "Tap to start";
  const sub =
    phase === "result"
      ? "Tap again to retry"
      : phase === "go"
        ? "Hit the button"
        : phase === "waiting"
          ? "It will turn green in a moment"
          : phase === "early"
            ? "You went before the signal"
            : "Stay alert — green = tap";

  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Processing speed · reaction time
        </div>
        <h3 className="mt-2 font-display text-2xl text-slate-900">Reaction light</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The button turns red, then green. Tap as fast as you can when it goes green. Tapping
          early counts as a miss.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">{history.length} runs</Badge>
          <Badge tone={best !== null ? "good" : "calm"}>
            Best {best !== null ? `${Math.round(best)}ms` : "—"}
          </Badge>
          <Badge tone="info">Avg {avg !== null ? `${avg}ms` : "—"}</Badge>
        </div>
        {history.length > 0 ? (
          <ul className="mt-5 space-y-1">
            {history.map((run, idx) => (
              <li
                key={`${run.recordedAt}-${idx}`}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2 text-slate-700">
                  <Timer size={14} className="text-slate-500" aria-hidden />
                  Run {history.length - idx}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {Math.round(run.reactionMs)} ms
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => setHistory([])} disabled={!history.length}>
            Clear history
          </Button>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={tap}
        className={cx(
          "flex aspect-[4/3] flex-col items-center justify-center rounded-3xl border-4 border-slate-200/0 text-white shadow-(--shadow-elevated) transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500 lg:aspect-auto lg:min-h-[400px]",
          surface,
        )}
        whileTap={{ scale: 0.985 }}
      >
        <Zap size={42} className="mb-3 opacity-80" aria-hidden />
        <div className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          {headline}
        </div>
        <div className="mt-2 text-sm font-medium opacity-90">{sub}</div>
      </motion.button>
    </div>
  );
}
