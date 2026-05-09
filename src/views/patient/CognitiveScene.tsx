import MemoryGame from "../../components/panels/MemoryGame";
import type { GameSession } from "../../types/app";

interface CognitiveSceneProps {
  onSessionRecorded: (session: GameSession) => void;
  voiceEnabled: boolean;
}

export function CognitiveScene({ onSessionRecorded, voiceEnabled }: CognitiveSceneProps) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Memory games
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          Three short exercises that map to the cognitive domains most often targeted in
          older-adult research. Play one a day to track a baseline.
        </p>
      </header>

      <MemoryGame onSessionRecorded={onSessionRecorded} voiceEnabled={voiceEnabled} />
    </div>
  );
}
