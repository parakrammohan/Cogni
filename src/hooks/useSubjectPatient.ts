/**
 * Resolves the "subject patient" — whose data should the current view
 * show? For a patient role, themselves; for a caregiver, the first
 * paired patient (multi-patient selection lands in a later stage).
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { PairingStatus } from "../api/pairing";

export function useSubjectPatient(): {
  patientId: string | null;
  patientName: string | null;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const role = user?.role ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["pairing-status", user?.id ?? "none"],
    queryFn: () => api<PairingStatus>("/api/v1/pairing/status"),
    enabled: !!user,
  });

  if (!user) {
    return { patientId: null, patientName: null, isLoading: false };
  }
  if (role === "patient") {
    return { patientId: user.id, patientName: user.display_name, isLoading: false };
  }
  const first = data?.pairings[0]?.partner ?? null;
  return {
    patientId: first?.id ?? null,
    patientName: first?.display_name ?? null,
    isLoading,
  };
}
