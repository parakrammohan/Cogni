/** Patient profile + caregiver-managed care features. */

export interface PatientProfile {
  name: string;
  preferredName: string;
  /** ISO date string, or empty */
  birthDate: string;
  bloodType: string;
  allergies: string;
  medicalNotes: string;
  homeAddress: string;
  /** Data URL or remote URL. Empty string = use initials avatar. */
  photo: string;
}

export interface CareContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  isEmergency: boolean;
  /** Data URL, remote URL, or empty for initials */
  photo: string;
}

export interface CareReminder {
  id: string;
  label: string;
  /** HH:MM 24h, e.g. "08:00" */
  time: string;
  recurring: boolean;
  /** Optional notes (dosage, instructions) */
  notes: string;
  /** Persisted completion timestamp for today (clears at next local midnight) */
  completedAt: number | null;
}

export interface CareMemory {
  id: string;
  caption: string;
  /** Data URL or remote URL */
  photo: string;
  /** Optional date or descriptor for the memory */
  context: string;
}

// Empty defaults. Real data comes from the backend (Stage 3 onward).
// The emergency entry is the only baked-in contact because every patient
// should have at least an "Emergency" tap-to-call even before a caregiver
// has filled in the people list.

export const DEFAULT_PROFILE: PatientProfile = {
  name: "",
  preferredName: "",
  birthDate: "",
  bloodType: "",
  allergies: "",
  medicalNotes: "",
  homeAddress: "",
  photo: "",
};

export const DEFAULT_CONTACTS: CareContact[] = [
  {
    id: "c-emergency",
    name: "Emergency",
    relationship: "Call 995",
    phone: "995",
    isEmergency: true,
    photo: "",
  },
];

export const DEFAULT_REMINDERS: CareReminder[] = [];

export const DEFAULT_MEMORIES: CareMemory[] = [];
