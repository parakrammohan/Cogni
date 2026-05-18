import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";

export interface ReminderDto {
  id: string;
  patient_id: string;
  label: string;
  notes: string;
  time_of_day: string;
  recurring: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReminderCreate = { label: string; notes?: string; time_of_day?: string; recurring?: boolean };
export type ReminderPatch = Partial<ReminderCreate>;

export const remindersKeys = {
  list: (patientId: string) => ["reminders", patientId] as const,
};

export function useReminders(patientId: string | null) {
  return useQuery({
    queryKey: remindersKeys.list(patientId ?? "none"),
    queryFn: () => api<ReminderDto[]>(`/api/v1/patients/${patientId}/reminders`),
    enabled: !!patientId,
  });
}

export function useCreateReminder(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReminderCreate) =>
      api<ReminderDto>(`/api/v1/patients/${patientId}/reminders`, { method: "POST", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersKeys.list(patientId) }),
  });
}

export function usePatchReminder(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReminderPatch & { id: string }) =>
      api<ReminderDto>(`/api/v1/reminders/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersKeys.list(patientId) }),
  });
}

export function useToggleReminder(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<ReminderDto>(`/api/v1/reminders/${id}/toggle`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersKeys.list(patientId) }),
  });
}

export function useDeleteReminder(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/reminders/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: remindersKeys.list(patientId) }),
  });
}
