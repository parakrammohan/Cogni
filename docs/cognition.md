# Cognitive games

Three short games map to cognitive domains commonly targeted in older-adult research. None of them produce clinical scores; they produce **personal baselines** that the caregiver dashboard can trend over time.

## Where each game lives

| Game | Component | Domain |
|---|---|---|
| **Sequence recall** | `components/panels/SequenceRecallGame.tsx` | Working memory (Corsi-style spatial span) |
| **Pattern ladder** | `components/panels/ReasoningGame.tsx` | Inductive / serial-pattern reasoning |
| **Target scan** | `components/panels/VisualSearchGame.tsx` | Visual search / processing speed |

The hub component `MemoryGame.tsx` is the patient-side tab strip that swaps between them.

## Sequence recall

A 3×3 grid version of the classic Corsi block-tapping test.

### How a session runs

1. The grid lights up in a sequence — span starts at **3 tiles**, lit for 520 ms each, with 180 ms gaps.
2. The grid waits for input. The patient taps tiles in the same order to **draft** an answer.
3. The patient submits. Drafts can be undone or cleared first.
4. If the draft matches the sequence exactly:
   - A `checkpoint` session is recorded (memorySpan = current span).
   - Span advances by +1 and a new sequence plays.
5. If the draft is wrong, the session ends. A `final` session is recorded with `memorySpan = lastSuccessfulSpan` and `mistakes = 1`.

There's also a "Finish current session" button that ends early with span = `max(2, currentSpan - 1)`.

### What gets logged

```ts
interface GameSession {
  id: string;             // stable per-session
  createdAt: number;
  memorySpan: number;
  avgReaction: number;    // ms; mean of inter-tap delays
  mistakes: number;
  status?: "checkpoint" | "final";
}
```

### Reaction time measurement

`promptReadyRef.current` is set when the input phase begins. Each tap records `delay = performance.now() - promptReadyRef.current`, then resets the reference. So `avgReaction` is the mean inter-tap delay — a proxy for processing-speed during recall.

### Voice prompts

If `voiceEnabled` is on (toggle lives at the top of the **Memory games** scene next to the games — patient-controlled, not buried in operator settings), `speakText()` uses `window.speechSynthesis` to narrate state changes ("Watch the sequence", "Sequence complete", etc.) at rate 0.96 / pitch 1.02. No voice picker UI yet — uses the browser default.

## Pattern ladder

Five rounds of "what's the next number?". Three task types:

### Arithmetic (constant step)

```
prompt = [start, start + step, start + 2*step, start + 3*step]
answer = start + 4 * step
```

`start` ∈ [2, 9], `step` ∈ [2, 5].

### Growing gap

```
prompt = [start, start+2, start+5, start+9]   // gaps: 2, 3, 4
answer = start + 14                            // next gap: 5
```

`start` ∈ [3, 8].

### Alternating (the previously-buggy one)

Pattern alternates `+add, -subtract, +add, -subtract`:

```
prompt[0] = start
prompt[1] = start + add
prompt[2] = start + add - subtract
prompt[3] = start + 2*add - subtract
answer    = prompt[3] - subtract     // because step 5 is a SUBTRACT step
```

`start` ∈ [10, 19], `add` ∈ [5, 8], `subtract` ∈ [1, 3].

> Historical note: prior to the v0.2 fix, `answer` was `prompt[3] + add`, which was always wrong. The "one set always wrong" bug your testers saw was this — fixed now.

### Distractors

Each task generates four options that are shuffled and shown:

| Task | Distractors |
|---|---|
| Arithmetic | answer, answer + step, answer − step, answer + 2*step |
| Growing gap | answer, answer − 1, answer + 2, answer + 4 |
| Alternating | answer, answer + subtract, prompt[3] + add, prompt[3] − add |

### Scoring

Per round, response time is `performance.now() - startedAt`. After 5 rounds:

```
correctness:  X/5
mistakes:     5 - X
avgReaction:  mean(responseTimes)
```

The session is shown in the patient UI; **it does not feed `gameHistory`** (that's reserved for sequence recall, which is what the trend chart tracks). The pattern ladder is a "warm-up" exercise.

## Target scan (visual search)

Six rounds. Each round shows a target symbol pair (e.g. `7H`) and a 3×4 grid of 12 cells where one cell matches the target and 11 are similar-looking distractors (`H7`, `3E`, `8B`, etc.).

```ts
const SYMBOL_PAIRS = ["7H", "H7", "3E", "E3", "5S", "S5", "8B", "B8",
                       "2Z", "Z2", "6G", "G6"];
const target = randomly chosen
const distractors = shuffle(SYMBOL_PAIRS without target).slice(0, 11)
const answerIndex = random in [0, 11]
const cells = distractors with target spliced at answerIndex
```

Click correct cell → `correct++`. Click wrong → `mistakes++`. After 6 rounds, an end summary is shown.

Like pattern ladder, this is a **warm-up game** — it doesn't feed `gameHistory`.

## Cognitive trend chart

The caregiver view's `TrendPanel.tsx` plots only **sequence recall** sessions. It shows:

- Memory span over the last 24 sessions (cyan line).
- Average reaction time over the same range (orange line).
- Quick stats: average span, average reaction, latest session, total session count.

## Decline detection

`compareCognitionSession(session, history, addAlert)` runs every time a final (non-checkpoint) sequence session lands. It computes a baseline from prior finalized sessions:

```
baseline.memorySpan  = mean(prior session memorySpans)
baseline.avgReaction = mean(prior session avgReactions)
```

It fires a **warning** alert ("Cognitive decline signal") iff:

```
session.memorySpan  <= baseline.memorySpan - 1
   OR
session.avgReaction >= baseline.avgReaction * 1.2
```

Otherwise it fires an **info** alert ("Assessment session logged"). The first session ever has no baseline, so it logs an info about establishing a baseline.

Heuristic, not clinical. Don't claim it as diagnosis in the demo.

## Persistence

`gameHistory` is stored under `cognitrack.gameHistory` in `localStorage`. Capped at 30 entries (oldest dropped). Survives page reloads.

## Limitations

- `Math.random()` shuffle in pattern ladder and visual search is biased (`sort(() => Math.random() - 0.5)` doesn't produce uniform permutations). Acceptable for a hackathon demo; would be replaced with Fisher–Yates in production.
- Reaction-time measurement assumes a single user. Concurrent input from multiple devices isn't modeled.
- Decline thresholds (1-span drop, 20% reaction increase) are demo-grade. Real cognitive screening uses standardized batteries (MoCA, MMSE) with normative data.
