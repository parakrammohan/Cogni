/**
 * Bridges the existing UI `CareContact[]` shape (camelCase, local IDs)
 * to the backend `ContactDto[]` shape (snake_case, server UUIDs).
 *
 * Drop-in replacement for
 * `usePersistentState<CareContact[]>(STORAGE_KEYS.contacts, DEFAULT_CONTACTS)`
 * — the existing ContactsEditor calls `onChange(nextList)` with the
 * whole list after every edit, so we diff against the current backend
 * state and issue create / patch / delete mutations as needed.
 *
 * IDs whose form doesn't match a backend UUID (i.e. locally-generated
 * `c-…` placeholders from the editor's add flow) are treated as "create"
 * targets; the backend assigns a real UUID on POST, and the next
 * invalidation pulls it back.
 */

import { useCallback } from "react";

import {
  useContacts as useContactsQuery,
  useCreateContact,
  useDeleteContact,
  usePatchContact,
  type ContactDto,
} from "../api/contacts";
import type { CareContact } from "../features/care/types";
import { useSubjectPatient } from "./useSubjectPatient";

type Setter = (next: CareContact[] | ((prev: CareContact[]) => CareContact[])) => void;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const looksLikeServerId = (id: string) => UUID_RE.test(id);

function fromDto(dto: ContactDto): CareContact {
  return {
    id: dto.id,
    name: dto.name,
    relationship: dto.relationship,
    phone: dto.phone,
    isEmergency: dto.is_emergency,
    photo: dto.photo_url,
  };
}

function toCreateDto(ui: CareContact) {
  return {
    name: ui.name,
    relationship: ui.relationship,
    phone: ui.phone,
    is_emergency: ui.isEmergency,
    photo_url: ui.photo,
  };
}

function fieldsEqual(a: CareContact, b: CareContact): boolean {
  return (
    a.name === b.name &&
    a.relationship === b.relationship &&
    a.phone === b.phone &&
    a.isEmergency === b.isEmergency &&
    a.photo === b.photo
  );
}

export function useBackendContacts(): [CareContact[], Setter] {
  const { patientId } = useSubjectPatient();
  const { data } = useContactsQuery(patientId);
  const idKey = patientId ?? "_unset_";
  const create = useCreateContact(idKey);
  const patch = usePatchContact(idKey);
  const remove = useDeleteContact(idKey);

  const current: CareContact[] = data ? data.map(fromDto) : [];

  const setContacts = useCallback<Setter>(
    (next) => {
      if (!patientId) return;
      const resolved = typeof next === "function" ? next(current) : next;
      const byId = new Map(current.map((c) => [c.id, c] as const));
      const seen = new Set<string>();
      for (const item of resolved) {
        if (item.id && looksLikeServerId(item.id) && byId.has(item.id)) {
          seen.add(item.id);
          const before = byId.get(item.id)!;
          if (!fieldsEqual(before, item)) {
            patch.mutate({ id: item.id, ...toCreateDto(item) });
          }
        } else {
          // Locally-generated id (or empty) → create on the server.
          create.mutate(toCreateDto(item));
        }
      }
      for (const c of current) {
        if (!seen.has(c.id)) {
          remove.mutate(c.id);
        }
      }
    },
    [current, patientId, create, patch, remove],
  );

  return [current, setContacts];
}
