/**
 * Bridges the existing UI `PatientProfile` shape (camelCase) to the
 * backend `ProfileDto` shape (snake_case). Drop-in replacement for
 * `usePersistentState<PatientProfile>(STORAGE_KEYS.profile, DEFAULT_PROFILE)`
 * so the rest of the app doesn't have to change.
 */

import { useCallback } from "react";

import {
  useProfile as useProfileQuery,
  useUpdateProfile,
  type ProfileDto,
  type ProfileUpdate,
} from "../api/profile";
import { DEFAULT_PROFILE, type PatientProfile } from "../features/care/types";
import { useSubjectPatient } from "./useSubjectPatient";

function fromDto(dto: ProfileDto): PatientProfile {
  return {
    name: dto.full_name,
    preferredName: dto.preferred_name,
    birthDate: dto.birth_date ?? "",
    bloodType: dto.blood_type,
    allergies: dto.allergies,
    medicalNotes: dto.medical_notes,
    homeAddress: dto.home_address,
    photo: dto.photo_url,
    caregiverLocked: dto.caregiver_locked,
  };
}

function toDto(ui: PatientProfile): ProfileUpdate {
  return {
    full_name: ui.name,
    preferred_name: ui.preferredName,
    birth_date: ui.birthDate || null,
    blood_type: ui.bloodType,
    allergies: ui.allergies,
    medical_notes: ui.medicalNotes,
    home_address: ui.homeAddress,
    photo_url: ui.photo,
    caregiver_locked: ui.caregiverLocked,
  };
}

type Setter = (next: PatientProfile | ((prev: PatientProfile) => PatientProfile)) => void;

export function useBackendProfile(): [PatientProfile, Setter] {
  const { patientId } = useSubjectPatient();
  const { data } = useProfileQuery(patientId);
  const mutation = useUpdateProfile(patientId ?? "_unset_");

  const current: PatientProfile = data ? fromDto(data) : DEFAULT_PROFILE;

  const setProfile = useCallback<Setter>(
    (next) => {
      if (!patientId) return;
      const resolved = typeof next === "function" ? next(current) : next;
      mutation.mutate(toDto(resolved));
    },
    [current, patientId, mutation],
  );

  return [current, setProfile];
}
