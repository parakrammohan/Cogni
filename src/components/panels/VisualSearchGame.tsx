import { useMemo, useState } from "react";
import { ScanSearch, TimerReset } from "lucide-react";

import Badge from "../ui/Badge";
import { average } from "../../lib/utils";

interface SearchRound {
  target: string;
  cells: string[];
  answerIndex: number;
}

const SYMBOL_PAIRS = [
  "7H",
  "H7",
  "3E",
  "E3",
  "5S",
  "S5",
  "8B",
  "B8",
  "2Z",
  "Z2",
  "6G",
  "G6",
];

function shuffle<T>(values: T[]) {
  return [...values].sort(() => Math.random() - 0.5);
}

function createRound(): SearchRound {
  const target = SYMBOL_PAIRS[Math.floor(Math.random() * SYMBOL_PAIRS.length)];
  const distractors = shuffle(SYMBOL_PAIRS.filter((value) => value !== target)).slice(0, 11);
  const answerIndex = Math.floor(Math.random() * 12);
  const cells = [...distractors];
  cells.splice(answerIndex, 0, target);
  return { target, cells, answerIndex };
}

export default function VisualSearchGame() {
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState("Find the target symbol pair as quickly as possible.");
  const [currentRound, setCurrentRound] = useState<SearchRound>(() => createRound());
  const [phase, setPhase] = useState<"idle" | "running" | "complete">("idle");
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState(() => performance.now());

  const avgReaction = useMemo(
    () => (responseTimes.length ? Math.round(average(responseTimes)) : 0),
    [responseTimes],
  );

  function startSession() {
    setRound(1);
    setCorrect(0);
    setMistakes(0);
    setResponseTimes([]);
    setCurrentRound(createRound());
    setStartedAt(performance.now());
    setPhase("running");
    setMessage("Six speed rounds. Tap the exact target, not the look-alike distractors.");
  }

  function advance(nextCorrect: number, nextMistakes: number, nextResponses: number[]) {
    if (round >= 6) {
      setPhase("complete");
      setMessage(
        `Search block complete. ${nextCorrect}/6 correct with ${nextMistakes} misses. Avg response ${Math.round(average(nextResponses) || 0)}ms.`,
      );
      return;
    }

    setRound((value) => value + 1);
    setCurrentRound(createRound());
    setStartedAt(performance.now());
  }

  function chooseCell(index: number) {
    if (phase !== "running") return;
    const elapsed = performance.now() - startedAt;
    const nextResponses = [...responseTimes, elapsed];
    setResponseTimes(nextResponses);

    if (index === currentRound.answerIndex) {
      const nextCorrect = correct + 1;
      setCorrect(nextCorrect);
      setMessage("Correct target found.");
      advance(nextCorrect, mistakes, nextResponses);
      return;
    }

    const nextMistakes = mistakes + 1;
    setMistakes(nextMistakes);
    setMessage("Missed target. Similar distractors are intentional.");
    advance(correct, nextMistakes, nextResponses);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[24px] border border-slate-300 bg-white p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Processing speed / visual search</div>
        <h3 className="mt-2 font-display text-3xl text-ink">Target scan</h3>
        <p className="mt-3 text-base leading-7 text-slate-600">
          A compact visual-search drill built around speed-of-processing style target detection with look-alike
          distractors.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Badge tone="info">Round {round}/6</Badge>
          <Badge tone={correct >= mistakes ? "good" : "warning"}>{correct} correct</Badge>
          <Badge tone={mistakes ? "danger" : "good"}>{mistakes} misses</Badge>
          <Badge tone="info">{avgReaction ? `${avgReaction}ms avg` : "timing ready"}</Badge>
        </div>
        <p className="mt-5 rounded-[20px] bg-slate-100 px-4 py-4 text-sm leading-6 text-slate-600">
          {message}
        </p>
        <button
          onClick={startSession}
          className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
        >
          <TimerReset size={18} />
          {phase === "running" ? "Restart speed block" : "Start speed block"}
        </button>
      </div>
      <div className="rounded-[24px] border border-slate-300 bg-slate-50 p-5">
        <div className="rounded-[22px] border border-slate-300 bg-white p-5">
          <div className="flex items-center gap-3 text-slate-500">
            <ScanSearch size={18} />
            <span className="text-xs uppercase tracking-[0.28em]">Find this target</span>
          </div>
          <div className="mt-4 inline-flex rounded-[18px] border border-cyan/30 bg-cyan/10 px-5 py-3 font-mono text-3xl font-semibold tracking-[0.2em] text-ink">
            {currentRound.target}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {currentRound.cells.map((cell, index) => (
              <button
                key={`${cell}-${index}`}
                onClick={() => chooseCell(index)}
                disabled={phase !== "running"}
                className="rounded-[20px] border border-slate-300 bg-white px-4 py-5 font-mono text-2xl font-semibold tracking-[0.14em] text-ink transition enabled:hover:-translate-y-0.5 enabled:hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cell}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
