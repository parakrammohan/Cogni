import { AudioLines, VolumeX } from "lucide-react";

import MemoryGame from "../../components/panels/MemoryGame";
import { Switch } from "../../components/ui/Switch";
import type { GameSession } from "../../types/app";

interface CognitiveSceneProps {
  onSessionRecorded: (session: GameSession) => void;
  voiceEnabled: boolean;
  onVoiceEnabledChange: (enabled: boolean) => void;
}

export function CognitiveScene({
  onSessionRecorded,
  voiceEnabled,
  onVoiceEnabledChange,
}: CognitiveSceneProps) {
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            Memory games
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
            Three short exercises mapped to common cognitive domains. Play one a day to track a
            baseline.
          </p>
        </div>
        <label className="inline-flex items-center gap-3 self-start rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
            {voiceEnabled ? <AudioLines size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-900">Voice prompts</span>
            <span className="block text-[11px] text-slate-500">
              {voiceEnabled ? "On — narrates instructions" : "Off — silent"}
            </span>
          </span>
          <Switch
            checked={voiceEnabled}
            onCheckedChange={onVoiceEnabledChange}
            aria-label="Voice prompts"
          />
        </label>
      </header>

      <MemoryGame onSessionRecorded={onSessionRecorded} voiceEnabled={voiceEnabled} />
    </div>
  );
}
