import { motion } from "framer-motion";
import { Play, RotateCcw, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../../lib/utils";
import { useTranslation } from "react-i18next";
type Pad = "red" | "green" | "blue" | "yellow";
interface PadStyle {
  base: string;
  active: string;
  ring: string;
  /** Hz */
  tone: number;
}
const PAD_STYLES: Record<Pad, PadStyle> = {
  red: {
    base: "bg-red-500/85 border-red-700/40",
    active: "bg-red-300 border-red-400 shadow-[0_0_60px_rgba(248,113,113,0.7)]",
    ring: "ring-red-300/50",
    tone: 261.63, // C4
  },
  green: {
    base: "bg-emerald-500/85 border-emerald-700/40",
    active: "bg-emerald-300 border-emerald-400 shadow-[0_0_60px_rgba(110,231,183,0.7)]",
    ring: "ring-emerald-300/50",
    tone: 329.63, // E4
  },
  blue: {
    base: "bg-blue-500/85 border-blue-700/40",
    active: "bg-blue-300 border-blue-400 shadow-[0_0_60px_rgba(147,197,253,0.7)]",
    ring: "ring-blue-300/50",
    tone: 392.0, // G4
  },
  yellow: {
    base: "bg-amber-400/90 border-amber-600/40",
    active: "bg-amber-200 border-amber-300 shadow-[0_0_60px_rgba(253,224,71,0.7)]",
    ring: "ring-amber-300/50",
    tone: 523.25, // C5
  },
};
const PADS: Pad[] = ["red", "green", "blue", "yellow"];

/**
 * Simon — colored pads light up with tones in a sequence; player repeats.
 * Each successful round adds one step. A miss ends the run.
 *
 * Web Audio API handles the tones. Tap-to-mute toggle in the header.
 */
export default function SimonGame() {
  const { t } = useTranslation();
  const [sequence, setSequence] = useState<Pad[]>([]);
  const [phase, setPhase] = useState<"idle" | "showing" | "input" | "fail">("idle");
  const [activePad, setActivePad] = useState<Pad | null>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);
  const sequenceRef = useRef<Pad[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelTokenRef = useRef(0);
  const round = sequence.length;
  const isPlaying = phase === "showing" || phase === "input";
  const playTone = useCallback(
    (frequency: number, durationMs = 280) => {
      if (muted) return;
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000 + 0.05);
    },
    [muted],
  );
  const flashPad = useCallback(
    (pad: Pad, durationMs = 320) =>
      new Promise<void>((resolve) => {
        setActivePad(pad);
        playTone(PAD_STYLES[pad].tone, durationMs);
        window.setTimeout(() => {
          setActivePad(null);
          window.setTimeout(resolve, 160);
        }, durationMs);
      }),
    [playTone],
  );
  const showSequence = useCallback(
    async (seq: Pad[], token: number) => {
      setPhase("showing");
      // Tiny pause so the user knows we're starting
      await new Promise((r) => window.setTimeout(r, 500));
      for (const pad of seq) {
        if (token !== cancelTokenRef.current) return;
        await flashPad(pad);
      }
      if (token !== cancelTokenRef.current) return;
      setInputIndex(0);
      setPhase("input");
    },
    [flashPad],
  );
  function startGame() {
    cancelTokenRef.current += 1;
    const token = cancelTokenRef.current;
    const first = randomPad();
    const initial = [first];
    sequenceRef.current = initial;
    setSequence(initial);
    setInputIndex(0);
    void showSequence(initial, token);
  }
  function reset() {
    cancelTokenRef.current += 1;
    setSequence([]);
    setActivePad(null);
    setInputIndex(0);
    setPhase("idle");
  }
  function handlePadTap(pad: Pad) {
    if (phase !== "input") return;
    const expected = sequenceRef.current[inputIndex];
    void flashPad(pad, 240);
    if (expected !== pad) {
      setBest((b) => Math.max(b, sequenceRef.current.length - 1));
      setPhase("fail");
      return;
    }
    const nextIndex = inputIndex + 1;
    if (nextIndex < sequenceRef.current.length) {
      setInputIndex(nextIndex);
      return;
    }
    // Round cleared — extend the sequence
    setBest((b) => Math.max(b, sequenceRef.current.length));
    const nextSeq = [...sequenceRef.current, randomPad()];
    sequenceRef.current = nextSeq;
    setSequence(nextSeq);
    cancelTokenRef.current += 1;
    const token = cancelTokenRef.current;
    window.setTimeout(() => void showSequence(nextSeq, token), 600);
  }

  // Cleanup audio context on unmount
  useEffect(
    () => () => {
      audioCtxRef.current?.close().catch(() => undefined);
    },
    [],
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("simonGame.workingMemorySequenceRecall")}
            </div>
            <h3 className="mt-2 font-display text-2xl text-slate-900">{t("simonGame.simon")}</h3>
          </div>
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            aria-label={muted ? t("simonGame.unmute") : t("simonGame.mute")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition hover:bg-slate-100"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("simonGame.watchTheColoredPadsLightUpTapThe")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="info">
            {t("simonGame.round")} {Math.max(round, 1)}
          </Badge>
          <Badge tone={best ? "good" : "calm"}>
            {t("simonGame.bestSpan")} {best}
          </Badge>
          {phase === "showing" ? (
            <Badge tone="warning">{t("simonGame.watchCarefully")}</Badge>
          ) : null}
          {phase === "input" ? <Badge tone="good">{t("simonGame.yourTurn")}</Badge> : null}
          {phase === "fail" ? (
            <Badge tone="danger">
              {t("simonGame.miss")} {round - 1} cleared
            </Badge>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {!isPlaying ? (
            <Button icon={<Play size={14} />} onClick={startGame}>
              {phase === "fail" ? t("simonGame.playAgain") : t("simonGame.start")}
            </Button>
          ) : null}
          {isPlaying || phase === "fail" ? (
            <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={reset}>
              {t("simonGame.reset")}
            </Button>
          ) : null}
        </div>
        {phase === "fail" ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Sparkles size={18} className="shrink-0" aria-hidden />
            <div>
              {t("simonGame.youClearedASpanOf")} <strong>{round - 1}</strong>
              {t("simonGame.runAnotherRoundBiggerChunks3339T")}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 shadow-(--shadow-soft)">
        <div className="grid grid-cols-2 gap-3">
          {PADS.map((pad) => {
            const isActive = activePad === pad;
            const enabled = phase === "input";
            return (
              <motion.button
                key={pad}
                type="button"
                onClick={() => handlePadTap(pad)}
                disabled={!enabled}
                aria-label={pad}
                whileTap={
                  enabled
                    ? {
                        scale: 0.96,
                      }
                    : undefined
                }
                className={cx(
                  "aspect-square rounded-3xl border-2 transition-all duration-150",
                  isActive ? PAD_STYLES[pad].active : PAD_STYLES[pad].base,
                  enabled ? "cursor-pointer hover:brightness-110" : "cursor-not-allowed",
                )}
              />
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          {t("simonGame.tipChunkTheSequenceIntoPairsOrTr")}
        </p>
      </div>
    </div>
  );
}
function randomPad(): Pad {
  const idx = Math.floor(Math.random() * PADS.length);
  return PADS[idx]!;
}
