/**
 * Bridges UI `CareReminder[]` (camelCase) to backend `ReminderDto[]`
 * (snake_case). Same diff-and-mutate pattern as useBackendContacts:
 * the existing RemindersEditor calls `onChange(nextList)` and we
 * translate to create/patch/delete on the server.
 *
 * Toggle is exported separately because the backend has a dedicated
 * `/reminders/{id}/toggle` endpoint that's safer than a PATCH race.
 */

import { useCallback } from "react";

import {
  useCreateReminder,
  useDeleteReminder,
  usePatchReminder,
  useReminders as useRemindersQuery,
  useToggleReminder as useToggleReminderHook,
  type ReminderDto,
} from "../api/reminders";
import type { CareReminder } from "../features/care/types";
import { useSubjectPatient } from "./useSubjectPatient";

type Setter = (next: CareReminder[] | ((prev: CareReminder[]) => CareReminder[])) => void;
type Toggle = (id: string) => void;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const looksLikeServerId = (id: string) => UUID_RE.test(id);

function fromDto(dto: ReminderDto): CareReminder {
  return {
    id: dto.id,
    label: dto.label,
    time: dto.time_of_day,
    recurring: dto.recurring,
    notes: dto.notes,
    completedAt: dto.completed_at ? new Date(dto.completed_at).getTime() : null,
  };
}

function toCreateDto(ui: CareReminder) {
  return {
    label: ui.label,
    notes: ui.notes,
    time_of_day: ui.time,
    recurring: ui.recurring,
  };
}

function fieldsEqual(a: CareReminder, b: CareReminder): boolean {
  return (
    a.label === b.label && a.notes === b.notes && a.time === b.time && a.recurring === b.recurring
  );
}

export function useBackendReminders(): [CareReminder[], Setter, Toggle] {
  const { patientId } = useSubjectPatient();
  const { data } = useRemindersQuery(patientId);
  const idKey = patientId ?? "_unset_";
  const create = useCreateReminder(idKey);
  const patch = usePatchReminder(idKey);
  const remove = useDeleteReminder(idKey);
  const toggleMut = useToggleReminderHook(idKey);

  const current: CareReminder[] = data ? data.map(fromDto) : [];

  const setReminders = useCallback<Setter>(
    (next) => {
      if (!patientId) return;
      const resolved = typeof next === "function" ? next(current) : next;
      const byId = new Map(current.map((r) => [r.id, r] as const));
      const seen = new Set<string>();
      for (const item of resolved) {
        if (item.id && looksLikeServerId(item.id) && byId.has(item.id)) {
          seen.add(item.id);
          const before = byId.get(item.id)!;
          // Completed-at flips go through the dedicated toggle endpoint
          // (handled outside the setter). Field changes go via PATCH.
          if (!fieldsEqual(before, item)) {
            patch.mutate({ id: item.id, ...toCreateDto(item) });
          }
        } else {
          create.mutate(toCreateDto(item));
        }
      }
      for (const r of current) {
        if (!seen.has(r.id)) {
          remove.mutate(r.id);
        }
      }
    },
    [current, patientId, create, patch, remove],
  );

  const toggle = useCallback<Toggle>(
    (id) => {
      if (!patientId || !looksLikeServerId(id)) return;
      toggleMut.mutate(id);
    },
    [patientId, toggleMut],
  );

  return [current, setReminders, toggle];
}
