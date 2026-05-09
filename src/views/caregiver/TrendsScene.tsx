import TrendPanel from "../../components/panels/TrendPanel";
import type { GameSession } from "../../types/app";

interface TrendsSceneProps {
  history: GameSession[];
}

export function TrendsScene({ history }: TrendsSceneProps) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Cognitive trends
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          Memory span and reaction time across the patient&apos;s stored sequence-recall
          sessions. Decline alerts compare the latest finalized session against the rolling
          baseline.
        </p>
      </header>

      <TrendPanel history={history} />

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
        <p>
          <strong>How decline detection works:</strong> when a final session lands, the alert
          engine fires a warning if memorySpan ≤ baseline − 1 OR avgReaction ≥ baseline × 1.2.
          Heuristic, not clinical.
        </p>
      </section>
    </div>
  );
}
