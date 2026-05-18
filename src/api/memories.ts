import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";

export interface MemoryDto {
  id: string;
  patient_id: string;
  caption: string;
  context: string;
  photo_url: string;
  created_at: string;
  updated_at: string;
}

export type MemoryCreate = { caption?: string; context?: string; photo_url?: string };
export type MemoryPatch = MemoryCreate;

export const memoriesKeys = {
  list: (patientId: string) => ["memories", patientId] as const,
};

export function useMemories(patientId: string | null) {
  return useQuery({
    queryKey: memoriesKeys.list(patientId ?? "none"),
    queryFn: () => api<MemoryDto[]>(`/api/v1/patients/${patientId}/memories`),
    enabled: !!patientId,
  });
}

export function useCreateMemory(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MemoryCreate) =>
      api<MemoryDto>(`/api/v1/patients/${patientId}/memories`, { method: "POST", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: memoriesKeys.list(patientId) }),
  });
}

export function usePatchMemory(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: MemoryPatch & { id: string }) =>
      api<MemoryDto>(`/api/v1/memories/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: memoriesKeys.list(patientId) }),
  });
}

export function useDeleteMemory(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/memories/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: memoriesKeys.list(patientId) }),
  });
}
