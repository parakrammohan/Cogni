import { useMemo, useState } from "react";
import { ArrowRight, Brain, Sigma } from "lucide-react";
import Badge from "../ui/Badge";
import { average } from "../../lib/utils";
import { useTranslation } from "react-i18next";
interface ReasoningTask {
  prompt: number[];
  answer: number;
  options: number[];
  hint: string;
}
function shuffle<T>(values: T[]) {
  return [...values].sort(() => Math.random() - 0.5);
}
function makeArithmeticTask(): ReasoningTask {
  const start = Math.floor(Math.random() * 8) + 2;
  const step = Math.floor(Math.random() * 4) + 2;
  const prompt = Array.from(
    {
      length: 4,
    },
    (_, index) => start + step * index,
  );
  const answer = start + step * 4;
  return {
    prompt,
    answer,
    options: shuffle([answer, answer + step, answer - step, answer + step * 2]),
    hint: `Constant step of ${step}`,
  };
}
function makeGrowingGapTask(): ReasoningTask {
  const start = Math.floor(Math.random() * 6) + 3;
  const prompt = [start];
  let current = start;
  for (let gap = 2; gap <= 4; gap += 1) {
    current += gap;
    prompt.push(current);
  }
  const answer = current + 5;
  return {
    prompt,
    answer,
    options: shuffle([answer, answer - 1, answer + 2, answer + 4]),
    hint: "Gap grows by +1 each time",
  };
}
function makeAlternatingTask(): ReasoningTask {
  // Pattern: start, +add, -subtract, +add, -subtract, ...
  // prompt indices 0..3:
  //   [0] start
  //   [1] start + add        (add step)
  //   [2] start + add - sub  (subtract step)
  //   [3] start + 2*add - sub (add step)
  // The 5th value (the answer) is a SUBTRACT step → prompt[3] - subtract.
  const start = Math.floor(Math.random() * 10) + 10;
  const add = Math.floor(Math.random() * 4) + 5;
  const subtract = Math.floor(Math.random() * 3) + 1;
  const prompt = [start];
  for (let index = 1; index < 4; index += 1) {
    const previous = prompt[index - 1]!;
    prompt.push(index % 2 === 1 ? previous + add : previous - subtract);
  }
  const last = prompt[3]!;
  const answer = last - subtract;
  return {
    prompt,
    answer,
    // Distractors: ±subtract, +add (the previously-buggy answer), -add
    options: shuffle([answer, answer + subtract, last + add, last - add]),
    hint: `Alternates +${add}, -${subtract}`,
  };
}
function createTask() {
  const generators = [makeArithmeticTask, makeGrowingGapTask, makeAlternatingTask];
  return generators[Math.floor(Math.random() * generators.length)]();
}
export default function ReasoningGame() {
  const { t } = useTranslation();
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState("Find the next number in each pattern.");
  const [task, setTask] = useState<ReasoningTask>(() => createTask());
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const [phase, setPhase] = useState<"idle" | "running" | "complete">("idle");
  const avgReaction = useMemo(
    () => (responseTimes.length ? Math.round(average(responseTimes)) : 0),
    [responseTimes],
  );
  function startSession() {
    setRound(1);
    setCorrect(0);
    setMistakes(0);
    setResponseTimes([]);
    setTask(createTask());
    setStartedAt(performance.now());
    setPhase("running");
    setMessage("Five pattern rounds. Pick the next number as quickly as you can.");
  }
  function advance(nextCorrect: number, nextMistakes: number, nextResponses: number[]) {
    if (round >= 5) {
      setPhase("complete");
      setMessage(
        `Session complete. ${nextCorrect}/5 correct with ${nextMistakes} mistakes. Avg response ${Math.round(average(nextResponses) || 0)}ms.`,
      );
      return;
    }
    setRound((value) => value + 1);
    setTask(createTask());
    setStartedAt(performance.now());
  }
  function submitAnswer(option: number) {
    if (phase !== "running") return;
    const elapsed = performance.now() - startedAt;
    const nextResponses = [...responseTimes, elapsed];
    setResponseTimes(nextResponses);
    if (option === task.answer) {
      const nextCorrect = correct + 1;
      setCorrect(nextCorrect);
      setMessage(`Correct. ${task.hint}.`);
      advance(nextCorrect, mistakes, nextResponses);
      return;
    }
    const nextMistakes = mistakes + 1;
    setMistakes(nextMistakes);
    setMessage(`Incorrect. ${task.hint}.`);
    advance(correct, nextMistakes, nextResponses);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[24px] border border-slate-300 bg-white p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {t("reasoningGame.reasoningSerialPatterns")}
        </div>
        <h3 className="mt-2 font-display text-3xl text-ink">{t("reasoningGame.patternLadder")}</h3>
        <p className="mt-3 text-base leading-7 text-slate-600">
          {t("reasoningGame.inspiredBySerialPatternAndInduct")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Badge tone="info">
            {t("reasoningGame.round")} {round}/5
          </Badge>
          <Badge tone={correct >= mistakes ? "good" : "warning"}>{correct} correct</Badge>
          <Badge tone={mistakes ? "danger" : "good"}>{mistakes} errors</Badge>
          <Badge tone="info">{avgReaction ? `${avgReaction}ms avg` : "timing ready"}</Badge>
        </div>
        <p className="mt-5 rounded-[20px] bg-slate-100 px-4 py-4 text-sm leading-6 text-slate-600">
          {message}
        </p>
        <button
          onClick={startSession}
          className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
        >
          <Brain size={18} />
          {phase === "running" ? "Restart reasoning set" : "Start reasoning set"}
        </button>
      </div>
      <div className="rounded-[24px] border border-slate-300 bg-slate-50 p-5">
        <div className="rounded-[22px] border border-slate-300 bg-white p-5">
          <div className="flex items-center gap-3 text-slate-500">
            <Sigma size={18} />
            <span className="text-xs uppercase tracking-[0.28em]">
              {t("reasoningGame.nextNumber")}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-3xl font-semibold text-ink">
            {task.prompt.map((value, index) => (
              <span key={`${value}-${index}`} className="inline-flex items-center gap-3">
                <span>{value}</span>
                <ArrowRight size={18} className="text-slate-400" />
              </span>
            ))}
            <span className="text-signal">?</span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {task.options.map((option) => (
              <button
                key={option}
                onClick={() => submitAnswer(option)}
                disabled={phase !== "running"}
                className="rounded-[20px] border border-slate-300 bg-white px-4 py-4 text-left text-lg font-semibold text-ink transition enabled:hover:-translate-y-0.5 enabled:hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
