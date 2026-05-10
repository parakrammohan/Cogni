import { useMemo, useState } from "react";
import { Lightbulb, RotateCcw } from "lucide-react";

import Badge from "../ui/Badge";
import { Button } from "../ui/Button";

interface Round {
  prompt: string;
  hint: string;
  answer: string;
  options: string[];
}

const POOL: Round[] = [
  { prompt: "Bread", hint: "Goes well with…", answer: "Butter", options: ["Butter", "Pencil", "Train", "Glass"] },
  { prompt: "Salt", hint: "Often paired with…", answer: "Pepper", options: ["Pepper", "Carpet", "Engine", "Kite"] },
  { prompt: "Needle", hint: "Companion of…", answer: "Thread", options: ["Thread", "Cloud", "Brick", "Lemon"] },
  { prompt: "Hammer", hint: "Usually paired with…", answer: "Nail", options: ["Nail", "Cup", "River", "Ladder"] },
  { prompt: "Knife", hint: "Often used with…", answer: "Fork", options: ["Fork", "Drum", "Tape", "Pillow"] },
  { prompt: "Cup", hint: "Sits on a…", answer: "Saucer", options: ["Saucer", "Tower", "Wheel", "Belt"] },
  { prompt: "Sun", hint: "Counterpart…", answer: "Moon", options: ["Moon", "Coin", "Door", "Mat"] },
  { prompt: "Lock", hint: "Opens with…", answer: "Key", options: ["Key", "Sock", "Glove", "Brush"] },
  { prompt: "Shoe", hint: "Goes with…", answer: "Sock", options: ["Sock", "Frame", "Plant", "Pen"] },
  { prompt: "Pen", hint: "Writes on…", answer: "Paper", options: ["Paper", "Spoon", "Rope", "Bowl"] },
  { prompt: "Cat", hint: "Common rival…", answer: "Dog", options: ["Dog", "Lamp", "Apple", "Bridge"] },
  { prompt: "Day", hint: "Other half…", answer: "Night", options: ["Night", "Tile", "Spoon", "Fern"] },
];

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

const ROUND_COUNT = 6;

/**
 * Word association — tests semantic memory. Pick the word most strongly
 * paired with the prompt. The pool is hand-curated for unambiguous answers.
 */
export default function WordAssociationGame() {
  const [seed, setSeed] = useState(0);
  const rounds = useMemo(() => {
    void seed;
    return shuffle([...POOL]).slice(0, ROUND_COUNT);
  }, [seed]);

  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [feedback, setFeedback] = useState<"" | "correct" | "wrong">("");
  const round = rounds[index];

  const phase = index >= ROUND_COUNT ? "complete" : "playing";

  function answer(option: string) {
    if (!round) return;
    if (option === round.answer) {
      setCorrect((c) => c + 1);
      setFeedback("correct");
    } else {
      setFeedback("wrong");
    }
    window.setTimeout(() => {
      setFeedback("");
      setIndex((i) => i + 1);
    }, 500);
  }

  function reset() {
    setIndex(0);
    setCorrect(0);
    setFeedback("");
    setSeed((s) => s + 1);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Semantic memory · word association
        </div>
        <h3 className="mt-2 font-display text-2xl text-slate-900">Word association</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Pick the word that most naturally goes with the prompt. Six rounds of common pairs.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">Round {Math.min(index + 1, ROUND_COUNT)}/{ROUND_COUNT}</Badge>
          <Badge tone={correct >= index + 1 - correct ? "good" : "warning"}>{correct} correct</Badge>
          {phase === "complete" ? (
            <Badge tone={correct >= 5 ? "good" : "warning"}>Final {correct}/{ROUND_COUNT}</Badge>
          ) : null}
        </div>
        {phase === "complete" ? (
          <Button className="mt-5" icon={<RotateCcw size={14} />} onClick={reset}>
            Run another set
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        {round ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Lightbulb size={16} />
              <span className="text-xs uppercase tracking-wider">{round.hint}</span>
            </div>
            <div className="mt-4 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
              {round.prompt}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {round.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => answer(option)}
                  disabled={feedback !== ""}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-lg font-semibold text-slate-900 shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-cyan-300 disabled:opacity-60"
                >
                  {option}
                </button>
              ))}
            </div>
            {feedback === "correct" ? (
              <p className="mt-3 text-sm font-semibold text-emerald-700">Nice — that&apos;s a strong pair.</p>
            ) : feedback === "wrong" ? (
              <p className="mt-3 text-sm font-semibold text-red-700">
                Not the strongest pair — answer was {round.answer}.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900">
            <strong>{correct}</strong> of {ROUND_COUNT} correct. Click &quot;Run another set&quot; to try another mix.
          </div>
        )}
      </div>
    </div>
  );
}
