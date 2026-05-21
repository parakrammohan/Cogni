import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, CheckCircle2, RotateCcw, Undo2 } from "lucide-react";
import Badge from "../ui/Badge";
import { average, cx } from "../../lib/utils";
import type { GameSession } from "../../types/app";

// Per-device adaptive difficulty: remember the last successful span so
// the next session resumes near where the patient left off instead of
// starting from 3 every time.
import { useTranslation } from "react-i18next";
const PERSISTED_SPAN_KEY = "cognitrack.lastSpan.sequence";
const MIN_SPAN = 3;
const MAX_SPAN = 12;
function readPersistedSpan(): number {
  try {
    const raw = window.localStorage.getItem(PERSISTED_SPAN_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= MIN_SPAN && n <= MAX_SPAN) return n;
    }
  } catch {
    /* SSR or disabled storage */
  }
  return MIN_SPAN;
}
function writePersistedSpan(span: number) {
  try {
    const clamped = Math.max(MIN_SPAN, Math.min(MAX_SPAN, Math.round(span)));
    window.localStorage.setItem(PERSISTED_SPAN_KEY, String(clamped));
  } catch {
    /* ignore */
  }
}
function speakText(text: string, enabled: boolean) {
  if (!enabled || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.96;
  utterance.pitch = 1.02;
  window.speechSynthesis.speak(utterance);
}
function generateSequence(length: number) {
  return Array.from(
    {
      length,
    },
    () => Math.floor(Math.random() * 9),
  );
}
interface SequenceRecallGameProps {
  onSessionRecorded: (session: GameSession) => void;
  voiceEnabled: boolean;
}
export default function SequenceRecallGame({
  onSessionRecorded,
  voiceEnabled,
}: SequenceRecallGameProps) {
  const { t } = useTranslation();
  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState("idle");
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [message, setMessage] = useState("Tap start to run a spatial recall session.");
  const [level, setLevel] = useState(3);
  const [draftAnswer, setDraftAnswer] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const promptReadyRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  const runIdRef = useRef(0);
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const clickDelaysRef = useRef<number[]>([]);
  const mistakesRef = useRef(0);
  useEffect(
    () => () => {
      clearPendingTimeouts();
    },
    [],
  );
  const markersByTile = useMemo(
    () =>
      Array.from(
        {
          length: 9,
        },
        (_, tileIndex) =>
          draftAnswer
            .map((value, index) => (value === tileIndex ? index + 1 : null))
            .filter((value): value is number => value !== null),
      ),
    [draftAnswer],
  );
  function clearPendingTimeouts() {
    timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    timeoutsRef.current = [];
  }
  function buildSession(memorySpan: number, status: GameSession["status"] = "final"): GameSession {
    const avgReaction = clickDelaysRef.current.length ? average(clickDelaysRef.current) : 0;
    return {
      id: sessionIdRef.current,
      createdAt: Date.now(),
      memorySpan,
      avgReaction,
      mistakes: mistakesRef.current,
      status,
    };
  }
  function beginNewRun() {
    runIdRef.current += 1;
    clearPendingTimeouts();
    return runIdRef.current;
  }
  function cancelRun() {
    runIdRef.current += 1;
    clearPendingTimeouts();
  }
  function schedule(runId: number, ms: number, callback?: () => void) {
    return new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => {
        if (runId !== runIdRef.current) {
          resolve(false);
          return;
        }
        callback?.();
        resolve(true);
      }, ms);
      timeoutsRef.current.push(timeout);
    });
  }
  async function playSequence(nextSequence: number[], runId = beginNewRun()) {
    setPhase("showing");
    setDraftAnswer([]);
    setMessage("Observe the illuminated sequence.");
    for (let index = 0; index < nextSequence.length; index += 1) {
      if (
        !(await schedule(runId, index === 0 ? 120 : 0, () => setHighlighted(nextSequence[index])))
      ) {
        return;
      }
      if (!(await schedule(runId, 520, () => setHighlighted(null)))) {
        return;
      }
      if (!(await schedule(runId, 180))) {
        return;
      }
    }
    if (runId !== runIdRef.current) return;
    promptReadyRef.current = performance.now();
    setPhase("input");
    setMessage("Build your answer on the grid, then submit it.");
  }
  async function startSession() {
    const runId = beginNewRun();
    // Resume at whichever span the patient last cleared (clamped to
    // MIN/MAX_SPAN). Starts at 3 the first time, climbs from there on
    // subsequent sessions — the screen no longer feels too easy after
    // a strong session.
    const initialLevel = readPersistedSpan();
    const nextSequence = generateSequence(initialLevel);
    sessionIdRef.current = `session-${Date.now()}`;
    setSequence(nextSequence);
    clickDelaysRef.current = [];
    mistakesRef.current = 0;
    setMistakes(0);
    setLevel(initialLevel);
    speakText("Watch the sequence, then build your answer and submit.", voiceEnabled);
    await playSequence(nextSequence, runId);
  }
  async function progressRound(nextLevel: number) {
    const runId = beginNewRun();
    const nextSequence = generateSequence(nextLevel);
    setSequence(nextSequence);
    setLevel(nextLevel);
    await playSequence(nextSequence, runId);
  }
  function finishSession(successfulSpan: number, failed = false) {
    cancelRun();
    const session = buildSession(successfulSpan, "final");
    const avgReaction = session.avgReaction;
    onSessionRecorded(session);
    // Remember the achieved span so the next session resumes here. We
    // never persist below MIN_SPAN so a one-off rough day doesn't drop
    // the patient back to the floor permanently.
    writePersistedSpan(successfulSpan);
    setPhase("complete");
    setMessage(
      failed
        ? `Session finished. Span ${successfulSpan}, avg reaction ${Math.round(avgReaction)}ms.`
        : `Great run. Span ${successfulSpan}, avg reaction ${Math.round(avgReaction)}ms.`,
    );
    setHighlighted(null);
    setDraftAnswer([]);
  }
  function endSessionEarly() {
    if (phase === "idle") return;
    const completedSpan = phase === "input" || phase === "showing" ? Math.max(2, level - 1) : level;
    finishSession(completedSpan, false);
  }
  function handleTileClick(tileIndex: number) {
    if (phase !== "input") return;
    if (draftAnswer.length >= sequence.length) return;
    const delay = performance.now() - promptReadyRef.current;
    promptReadyRef.current = performance.now();
    clickDelaysRef.current = [...clickDelaysRef.current, delay];
    setDraftAnswer((previous) => [...previous, tileIndex]);
  }
  function clearDraft() {
    if (phase !== "input") return;
    setDraftAnswer([]);
    promptReadyRef.current = performance.now();
  }
  function undoDraft() {
    if (phase !== "input" || !draftAnswer.length) return;
    setDraftAnswer((previous) => previous.slice(0, -1));
    promptReadyRef.current = performance.now();
  }
  function submitDraft() {
    if (phase !== "input" || draftAnswer.length !== sequence.length) return;
    const isMatch = draftAnswer.every((value, index) => sequence[index] === value);
    if (!isMatch) {
      mistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      speakText("Sequence mismatch detected.", voiceEnabled);
      finishSession(level - 1, true);
      return;
    }
    onSessionRecorded(buildSession(level, "checkpoint"));
    const nextLevel = level + 1;
    setPhase("transition");
    setMessage(`Sequence cleared. Advancing to span ${nextLevel}.`);
    speakText(`Sequence complete. Advancing to span ${nextLevel}.`, voiceEnabled);
    const timeout = window.setTimeout(() => {
      progressRound(nextLevel);
    }, 650);
    timeoutsRef.current.push(timeout);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[24px] border border-slate-300 bg-white p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {t("sequenceRecallGame.workingMemorySequenceRecall")}
        </div>
        <h3 className="mt-2 font-display text-3xl text-ink">
          {t("sequenceRecallGame.3x3SpatialSequenceTest")}
        </h3>
        <p className="mt-3 text-base leading-7 text-slate-600">
          {t("sequenceRecallGame.watchTheSequenceBuildADraftRespo")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Badge tone="info">
            {t("sequenceRecallGame.span")} {level}
          </Badge>
          <Badge tone={phase === "input" ? "good" : "calm"}>{phase}</Badge>
          <Badge tone={mistakes ? "danger" : "good"}>{mistakes} errors</Badge>
          <Badge tone="info">
            {t("sequenceRecallGame.draft")} {draftAnswer.length}/{sequence.length}
          </Badge>
        </div>
        <p className="mt-5 rounded-[20px] bg-slate-100 px-4 py-4 text-sm leading-6 text-slate-600">
          {message}
        </p>
        <div className="mt-4 min-h-[74px] rounded-[20px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
            {t("sequenceRecallGame.draftAnswer")}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {draftAnswer.length ? (
              draftAnswer.map((tile, index) => (
                <span
                  key={`${tile}-${index}`}
                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-ink"
                >
                  {index + 1}. Tile {tile + 1}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">
                {t("sequenceRecallGame.noSelectionsYet")}
              </span>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={startSession}
            className="inline-flex items-center gap-3 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          >
            <BrainCircuit size={18} />
            {phase === "idle" || phase === "complete" ? "Start session" : "Restart session"}
          </button>
          <button
            onClick={submitDraft}
            disabled={phase !== "input" || draftAnswer.length !== sequence.length}
            className="inline-flex items-center gap-3 rounded-2xl bg-cyan px-5 py-3 text-sm font-semibold text-ink transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCircle2 size={18} />
            {t("sequenceRecallGame.submitAnswer")}
          </button>
          <button
            onClick={undoDraft}
            disabled={phase !== "input" || !draftAnswer.length}
            className="inline-flex items-center gap-3 rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600 transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Undo2 size={18} />
            {t("sequenceRecallGame.undoLast")}
          </button>
          <button
            onClick={clearDraft}
            disabled={phase !== "input" || !draftAnswer.length}
            className="inline-flex items-center gap-3 rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600 transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw size={18} />
            {t("sequenceRecallGame.clearAnswer")}
          </button>
          <button
            onClick={endSessionEarly}
            disabled={phase === "idle"}
            className="inline-flex items-center gap-3 rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600 transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CheckCircle2 size={18} />
            {t("sequenceRecallGame.finishCurrentSession")}
          </button>
        </div>
      </div>
      <div className="rounded-[24px] border border-slate-300 bg-slate-50 p-5">
        <div className="grid grid-cols-3 gap-3">
          {Array.from(
            {
              length: 9,
            },
            (_, tileIndex) => {
              const isHot = highlighted === tileIndex;
              const markers = markersByTile[tileIndex];
              const isDrafted = draftAnswer.includes(tileIndex);
              return (
                <button
                  key={tileIndex}
                  onClick={() => handleTileClick(tileIndex)}
                  disabled={phase !== "input"}
                  className={cx(
                    "relative aspect-square overflow-hidden rounded-[22px] border text-2xl font-semibold transition",
                    isHot
                      ? "border-signal bg-signal text-white shadow-[0_20px_40px_rgba(255,111,77,0.35)]"
                      : isDrafted
                        ? "border-cyan/35 bg-cyan/10 text-ink"
                        : "border-slate-300 bg-white text-slate-500",
                    phase === "input" ? "hover:border-ink hover:text-ink" : "cursor-default",
                  )}
                >
                  <div className="absolute right-2 top-2 flex max-w-[65%] flex-wrap justify-end gap-1">
                    {markers.map((marker) => (
                      <span
                        key={`${tileIndex}-${marker}`}
                        className="rounded-full bg-ink px-1.5 py-0.5 text-xs font-semibold text-white"
                      >
                        {marker}
                      </span>
                    ))}
                  </div>
                  {tileIndex + 1}
                </button>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
