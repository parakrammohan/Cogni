import { useEffect, useMemo, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { average } from "../../lib/utils";
import { useTranslation } from "react-i18next";
interface Problem {
  prompt: string;
  answer: number;
  options: number[];
}
const ROUND_COUNT = 8;
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
function generateProblem(round: number): Problem {
  // Difficulty climbs through the round set: small → mixed ops → 2-digit
  const tier = round < 3 ? "easy" : round < 6 ? "medium" : "hard";
  if (tier === "easy") {
    const a = randInt(2, 9);
    const b = randInt(2, 9);
    const op = pick(["+", "-"]);
    const answer = op === "+" ? a + b : a - b;
    return makeProblem(`${a} ${op} ${b}`, answer);
  }
  if (tier === "medium") {
    const op = pick(["+", "-", "×"]);
    if (op === "×") {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      return makeProblem(`${a} × ${b}`, a * b);
    }
    const a = randInt(11, 49);
    const b = randInt(2, 19);
    return makeProblem(`${a} ${op} ${b}`, op === "+" ? a + b : a - b);
  }
  // hard
  const op = pick(["+", "-"]);
  const a = randInt(20, 99);
  const b = randInt(20, 99);
  return makeProblem(`${a} ${op} ${b}`, op === "+" ? a + b : a - b);
}
function makeProblem(prompt: string, answer: number): Problem {
  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const delta = pick([-3, -2, -1, 1, 2, 3, 5, -5, 10, -10]);
    const candidate = answer + delta;
    if (candidate !== answer) distractors.add(candidate);
  }
  return {
    prompt,
    answer,
    options: shuffle([answer, ...distractors]),
  };
}
function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Quick mental arithmetic. Tests processing speed and working memory.
 * Eight rounds of escalating difficulty, multiple-choice answers.
 */
export default function QuickMathGame() {
  const { t } = useTranslation();
  const [round, setRound] = useState(0);
  const [problem, setProblem] = useState<Problem>(() => generateProblem(0));
  const [correct, setCorrect] = useState(0);
  const [responses, setResponses] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<"" | "correct" | "wrong">("");
  const [phase, setPhase] = useState<"playing" | "complete">("playing");
  const [startedAt, setStartedAt] = useState(performance.now());
  const avgReaction = useMemo(
    () => (responses.length ? Math.round(average(responses)) : 0),
    [responses],
  );
  useEffect(() => {
    if (phase === "playing") setStartedAt(performance.now());
  }, [round, phase]);
  function answer(option: number) {
    const elapsed = performance.now() - startedAt;
    setResponses((r) => [...r, elapsed]);
    if (option === problem.answer) {
      setCorrect((c) => c + 1);
      setFeedback("correct");
    } else {
      setFeedback("wrong");
    }
    window.setTimeout(() => {
      setFeedback("");
      if (round + 1 >= ROUND_COUNT) {
        setPhase("complete");
        return;
      }
      setRound((r) => r + 1);
      setProblem(generateProblem(round + 1));
    }, 450);
  }
  function reset() {
    setRound(0);
    setCorrect(0);
    setResponses([]);
    setFeedback("");
    setPhase("playing");
    setProblem(generateProblem(0));
    setStartedAt(performance.now());
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("quickMathGame.processingSpeedArithmetic")}
        </div>
        <h3 className="mt-2 font-display text-2xl text-slate-900">
          {t("quickMathGame.quickMath")}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("quickMathGame.eightRoundsOfMentalArithmeticDif")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">
            {t("quickMathGame.round")} {Math.min(round + 1, ROUND_COUNT)}/{ROUND_COUNT}
          </Badge>
          <Badge tone={correct >= round + 1 - correct ? "good" : "warning"}>
            {correct} correct
          </Badge>
          <Badge tone="info">
            {avgReaction ? `${avgReaction}ms` : t("quickMathGame.timingReady")}
          </Badge>
          {phase === "complete" ? (
            <Badge tone={correct >= 6 ? "good" : "warning"}>
              {t("quickMathGame.final")} {correct}/{ROUND_COUNT}
            </Badge>
          ) : null}
        </div>
        {phase === "complete" ? (
          <Button className="mt-5" icon={<RotateCcw size={14} />} onClick={reset}>
            {t("quickMathGame.runAnotherSet")}
          </Button>
        ) : null}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Calculator size={16} />
            <span className="text-xs uppercase tracking-wider">{t("quickMathGame.solve")}</span>
          </div>
          <div className="mt-4 font-display text-5xl font-semibold tabular-nums text-slate-900 sm:text-6xl">
            {problem.prompt} {t("quickMathGame.t0")}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {problem.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => answer(option)}
                disabled={feedback !== "" || phase === "complete"}
                className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-2xl font-semibold tabular-nums text-slate-900 shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-cyan-300 disabled:opacity-60"
              >
                {option}
              </button>
            ))}
          </div>
          {feedback === "correct" ? (
            <p className="mt-3 text-sm font-semibold text-emerald-700">
              {t("quickMathGame.correct")}
            </p>
          ) : feedback === "wrong" ? (
            <p className="mt-3 text-sm font-semibold text-red-700">
              {t("quickMathGame.notQuiteAnswerWas")} {problem.answer}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
