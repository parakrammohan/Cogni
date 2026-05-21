import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";

export interface ContactDto {
  id: string;
  patient_id: string;
  name: string;
  relationship: string;
  phone: string;
  photo_url: string;
  is_emergency: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ContactCreate = Partial<
  Omit<ContactDto, "id" | "patient_id" | "created_at" | "updated_at">
> &
  Pick<ContactDto, "name">;
export type ContactPatch = Partial<
  Omit<ContactDto, "id" | "patient_id" | "created_at" | "updated_at">
>;

export const contactsKeys = {
  list: (patientId: string) => ["contacts", patientId] as const,
};

export function useContacts(patientId: string | null) {
  return useQuery({
    queryKey: contactsKeys.list(patientId ?? "none"),
    queryFn: () => api<ContactDto[]>(`/api/v1/patients/${patientId}/contacts`),
    enabled: !!patientId,
  });
}

export function useCreateContact(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ContactCreate) =>
      api<ContactDto>(`/api/v1/patients/${patientId}/contacts`, { method: "POST", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKeys.list(patientId) }),
  });
}

export function usePatchContact(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ContactPatch & { id: string }) =>
      api<ContactDto>(`/api/v1/contacts/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKeys.list(patientId) }),
  });
}

export function useDeleteContact(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKeys.list(patientId) }),
  });
}
