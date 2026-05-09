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

export const DEFAULT_PROFILE: PatientProfile = {
  name: "Alex Tan",
  preferredName: "Alex",
  birthDate: "1948-03-12",
  bloodType: "O+",
  allergies: "Penicillin",
  medicalNotes: "Mild Alzheimer's (early-stage). On Donepezil 5 mg nightly.",
  homeAddress: "120 Orchard Road, Singapore",
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
  {
    id: "c-sarah",
    name: "Sarah Tan",
    relationship: "Daughter",
    phone: "+65 9123 4567",
    isEmergency: false,
    photo: "",
  },
  {
    id: "c-david",
    name: "David Tan",
    relationship: "Son",
    phone: "+65 9876 5432",
    isEmergency: false,
    photo: "",
  },
  {
    id: "c-lee",
    name: "Dr. Lee",
    relationship: "Family doctor",
    phone: "+65 6555 0001",
    isEmergency: false,
    photo: "",
  },
];

export const DEFAULT_REMINDERS: CareReminder[] = [
  {
    id: "r-morning-meds",
    label: "Morning medication",
    time: "08:00",
    recurring: true,
    notes: "Donepezil 5 mg with breakfast",
    completedAt: null,
  },
  {
    id: "r-walk",
    label: "Short walk",
    time: "10:30",
    recurring: true,
    notes: "20 minutes around the block — keep within the safe zone",
    completedAt: null,
  },
  {
    id: "r-cog-game",
    label: "Memory game",
    time: "16:00",
    recurring: true,
    notes: "Sequence recall, two rounds",
    completedAt: null,
  },
];

export const DEFAULT_MEMORIES: CareMemory[] = [
  {
    id: "m-family-2024",
    caption: "Sarah's birthday at home",
    context: "March 2024",
    photo: "",
  },
  {
    id: "m-grand-2023",
    caption: "Walking with David in the park",
    context: "December 2023",
    photo: "",
  },
];
