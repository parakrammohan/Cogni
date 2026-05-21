/**
 * Bridges UI `CareMemory[]` (camelCase) to backend `MemoryDto[]`
 * (snake_case). Same diff-and-mutate pattern as the contacts and
 * reminders shims.
 */

import { useCallback } from "react";

import {
  useCreateMemory,
  useDeleteMemory,
  useMemories as useMemoriesQuery,
  usePatchMemory,
  type MemoryDto,
} from "../api/memories";
import type { CareMemory } from "../features/care/types";
import { useSubjectPatient } from "./useSubjectPatient";

type Setter = (next: CareMemory[] | ((prev: CareMemory[]) => CareMemory[])) => void;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const looksLikeServerId = (id: string) => UUID_RE.test(id);

function fromDto(dto: MemoryDto): CareMemory {
  return {
    id: dto.id,
    caption: dto.caption,
    photo: dto.photo_url,
    context: dto.context,
  };
}

function toCreateDto(ui: CareMemory) {
  return {
    caption: ui.caption,
    context: ui.context,
    photo_url: ui.photo,
  };
}

function fieldsEqual(a: CareMemory, b: CareMemory): boolean {
  return a.caption === b.caption && a.context === b.context && a.photo === b.photo;
}

export function useBackendMemories(): [CareMemory[], Setter] {
  const { patientId } = useSubjectPatient();
  const { data } = useMemoriesQuery(patientId);
  const idKey = patientId ?? "_unset_";
  const create = useCreateMemory(idKey);
  const patch = usePatchMemory(idKey);
  const remove = useDeleteMemory(idKey);

  const current: CareMemory[] = data ? data.map(fromDto) : [];

  const setMemories = useCallback<Setter>(
    (next) => {
      if (!patientId) return;
      const resolved = typeof next === "function" ? next(current) : next;
      const byId = new Map(current.map((m) => [m.id, m] as const));
      const seen = new Set<string>();
      for (const item of resolved) {
        if (item.id && looksLikeServerId(item.id) && byId.has(item.id)) {
          seen.add(item.id);
          const before = byId.get(item.id)!;
          if (!fieldsEqual(before, item)) {
            patch.mutate({ id: item.id, ...toCreateDto(item) });
          }
        } else {
          create.mutate(toCreateDto(item));
        }
      }
      for (const m of current) {
        if (!seen.has(m.id)) {
          remove.mutate(m.id);
        }
      }
    },
    [current, patientId, create, patch, remove],
  );

  return [current, setMemories];
}
