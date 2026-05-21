import { Check, ImageIcon, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../components/ui/Button";
import { cx } from "../../lib/utils";
import { readImageAsDataUrl } from "../../lib/readImageAsDataUrl";
import type { CareMemory } from "../../features/care/types";

interface MemoriesSceneProps {
  memories: ReadonlyArray<CareMemory>;
  /** Save the full new list back. Backed by useBackendMemories. */
  onMemoriesChange: (next: CareMemory[]) => void;
}

type FormMode = { kind: "closed" } | { kind: "add" } | { kind: "edit"; id: string };

function emptyMemory(): CareMemory {
  return {
    id: `m-${Date.now()}`,
    caption: "",
    photo: "",
    context: "",
  };
}

export function MemoriesScene({ memories, onMemoriesChange }: MemoriesSceneProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FormMode>({ kind: "closed" });

  function startAdd() {
    setMode({ kind: "add" });
  }
  function startEdit(id: string) {
    setMode({ kind: "edit", id });
  }
  function closeForm() {
    setMode({ kind: "closed" });
  }
  function commit(next: CareMemory) {
    if (mode.kind === "add") {
      onMemoriesChange([...memories, next]);
    } else if (mode.kind === "edit") {
      onMemoriesChange(memories.map((m) => (m.id === mode.id ? next : m)));
    }
    closeForm();
  }
  function removeMemory(id: string) {
    if (!window.confirm(t("memories.deleteConfirm"))) return;
    onMemoriesChange(memories.filter((m) => m.id !== id));
    if (mode.kind === "edit" && mode.id === id) closeForm();
  }

  const editingMemory =
    mode.kind === "edit" ? (memories.find((m) => m.id === mode.id) ?? null) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            {t("memories.title")}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
            {t("memories.subtitle")}
          </p>
        </div>
        {mode.kind === "closed" ? (
          <Button size="sm" icon={<Plus size={14} />} onClick={startAdd}>
            {t("memories.addMemory")}
          </Button>
        ) : null}
      </header>

      {mode.kind === "add" ? (
        <MemoryForm initial={emptyMemory()} onCancel={closeForm} onSave={commit} />
      ) : null}

      {memories.length === 0 && mode.kind === "closed" ? (
        <EmptyState />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map((memory) =>
            editingMemory?.id === memory.id ? (
              <MemoryForm
                key={memory.id}
                initial={editingMemory}
                onCancel={closeForm}
                onSave={commit}
                onDelete={() => removeMemory(memory.id)}
              />
            ) : (
              <MemoryCard key={memory.id} memory={memory} onEdit={() => startEdit(memory.id)} />
            ),
          )}
        </section>
      )}
    </div>
  );
}

function MemoryCard({ memory, onEdit }: { memory: CareMemory; onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-(--shadow-soft)">
      {memory.photo ? (
        <div className="aspect-[4/3] w-full overflow-hidden">
          <img src={memory.photo} alt={memory.caption} className="h-full w-full object-cover" />
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
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            {memory.caption || t("common.unknown")}
          </div>
          {memory.context ? (
            <div className="mt-0.5 text-xs text-slate-500">{memory.context}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${memory.caption || "memory"}`}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil size={14} aria-hidden />
        </button>
      </div>
    </article>
  );
}

function MemoryForm({
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: CareMemory;
  onCancel: () => void;
  onSave: (next: CareMemory) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CareMemory>(initial);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  function set<K extends keyof CareMemory>(key: K, value: CareMemory[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }
  function handlePhoto(file: File | undefined) {
    if (!file) return;
    void readImageAsDataUrl(file).then((dataUrl) => set("photo", dataUrl));
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-(--shadow-soft)">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        {draft.photo ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <img src={draft.photo} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => set("photo", "")}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white"
            >
              <X size={12} aria-hidden /> {t("common.remove")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className={cx(
              "flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-sm font-semibold text-white/90",
              colorForCaption(draft.caption),
            )}
          >
            <ImageIcon size={28} aria-hidden />
            {t("memories.addPhoto")}
          </button>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handlePhoto(e.target.files?.[0])}
          className="hidden"
        />
        <div className="space-y-2 p-4">
          <input
            type="text"
            placeholder={t("memories.caption")}
            value={draft.caption}
            onChange={(e) => set("caption", e.target.value)}
            autoFocus
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          />
          <input
            type="text"
            placeholder={t("memories.context")}
            value={draft.context}
            onChange={(e) => set("context", e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                <Trash2 size={13} aria-hidden />
                {t("common.delete")}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<X size={14} />}
                onClick={onCancel}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" size="sm" icon={<Check size={14} />}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      </form>
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">
        <Sparkles size={22} aria-hidden />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{t("memories.emptyHeading")}</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-600">{t("memories.emptyBody")}</p>
      </div>
    </div>
  );
}
