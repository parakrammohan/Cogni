import { api } from "./client";
import type { Role } from "../auth/types";

export interface PairedPartner {
  id: string;
  username: string;
  display_name: string;
  role: Role;
}

export interface PairingEntry {
  pairing_id: string;
  established_at: string;
  partner: PairedPartner;
}

export interface PairingStatus {
  role: Role;
  pairings: PairingEntry[];
}

export interface InviteCode {
  code: string;
  expires_at: string;
}

export function status(): Promise<PairingStatus> {
  return api<PairingStatus>("/api/v1/pairing/status");
}

export function createInvite(): Promise<InviteCode> {
  return api<InviteCode>("/api/v1/pairing/invite", { method: "POST" });
}

export function redeem(code: string): Promise<PairingEntry> {
  return api<PairingEntry>("/api/v1/pairing/redeem", {
    method: "POST",
    json: { code: code.trim().toUpperCase() },
  });
}

export function unpair(opts: { patient_id?: string } = {}): Promise<void> {
  const qs = opts.patient_id ? `?patient_id=${encodeURIComponent(opts.patient_id)}` : "";
  return api<void>(`/api/v1/pairing${qs}`, { method: "DELETE" });
}
