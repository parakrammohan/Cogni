import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";

export interface ProfileDto {
  patient_id: string;
  full_name: string;
  preferred_name: string;
  birth_date: string | null;
  blood_type: string;
  allergies: string;
  medical_notes: string;
  home_address: string;
  photo_url: string;
  caregiver_locked: boolean;
  updated_at: string;
}

export type ProfileUpdate = Partial<Omit<ProfileDto, "patient_id" | "updated_at">>;

export const profileKeys = {
  one: (patientId: string) => ["profile", patientId] as const,
};

export function useProfile(patientId: string | null) {
  return useQuery({
    queryKey: profileKeys.one(patientId ?? "none"),
    queryFn: () => api<ProfileDto>(`/api/v1/patients/${patientId}/profile`),
    enabled: !!patientId,
  });
}

export function useUpdateProfile(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdate) =>
      api<ProfileDto>(`/api/v1/patients/${patientId}/profile`, { method: "PUT", json: body }),
    onSuccess: (data) => qc.setQueryData(profileKeys.one(patientId), data),
  });
}
