import { ImageIcon, Sparkles } from "lucide-react";

import { cx } from "../../lib/utils";
import type { CareMemory } from "../../features/care/types";

interface MemoriesSceneProps {
  memories: ReadonlyArray<CareMemory>;
}

export function MemoriesScene({ memories }: MemoriesSceneProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Photo memories
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          A space for your caregiver to share photos with names and context.
        </p>
      </header>

      {memories.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </section>
      )}
    </div>
  );
}

function MemoryCard({ memory }: { memory: CareMemory }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-(--shadow-soft)">
      {memory.photo ? (
        <div className="aspect-[4/3] w-full overflow-hidden">
          <img
            src={memory.photo}
            alt={memory.caption}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          className={cx(
            "flex aspect-[4/3] w-full items-center justify-center",
            colorForCaption(memory.caption),
          )}
        >
          <ImageIcon size={28} className="text-white/80" aria-hidden />
        </div>
      )}
      <div className="p-4">
        <div className="text-sm font-semibold text-slate-900">{memory.caption}</div>
        {memory.context ? (
          <div className="mt-0.5 text-xs text-slate-500">{memory.context}</div>
        ) : null}
      </div>
    </article>
  );
}

function colorForCaption(caption: string) {
  // Stable gradient per caption — gives empty memories a varied warm look.
  let hash = 0;
  for (let i = 0; i < caption.length; i++) hash = (hash * 31 + caption.charCodeAt(i)) & 0xffffffff;
  const palettes = [
    "bg-gradient-to-br from-amber-300 to-rose-400",
    "bg-gradient-to-br from-emerald-300 to-cyan-400",
    "bg-gradient-to-br from-cyan-300 to-violet-400",
    "bg-gradient-to-br from-rose-300 to-violet-400",
    "bg-gradient-to-br from-orange-300 to-pink-400",
  ];
  return palettes[Math.abs(hash) % palettes.length]!;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">
        <Sparkles size={22} aria-hidden />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900">No memories yet</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-600">
          Your caregiver can add captioned photos from their dashboard. They&apos;ll show up here
          with names and context to help with recognition.
        </p>
      </div>
    </div>
  );
}
