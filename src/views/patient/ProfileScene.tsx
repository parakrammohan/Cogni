import {
  Cake,
  Check,
  Droplet,
  FileText,
  Home as HomeIcon,
  Pencil,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { PairingCard } from "../../components/PairingCard";
import type { CareContact, PatientProfile } from "../../features/care/types";

interface ProfileSceneProps {
  profile: PatientProfile;
  emergencyContact?: CareContact;
  /** Save edits back. Wired to the same backend mutation as the
   *  caregiver Manage scene, so changes round-trip through TanStack
   *  Query and stay in sync on both sides. */
  onProfileChange: (next: PatientProfile) => void;
}

/**
 * Patient's own profile.
 *
 * Both the patient and their paired caregiver can edit this — there's
 * no lock-out mechanism. A patient who signs up without a caregiver
 * fills it in themselves; once paired, either side can keep it up to
 * date. Locking the patient out of their own record was the
 * chicken-and-egg the old design had: until a caregiver was paired,
 * no one could enter the patient's details.
 */
export function ProfileScene({
  profile,
  emergencyContact,
  onProfileChange,
}: ProfileSceneProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-6">
      {editing ? (
        <ProfileEditor
          profile={profile}
          onSave={(next) => {
            onProfileChange(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ProfileReadOnly
          profile={profile}
          onEdit={() => setEditing(true)}
        />
      )}

      {emergencyContact ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
            In an emergency
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{emergencyContact.name}</h3>
              <p className="text-sm text-slate-600">{emergencyContact.relationship}</p>
            </div>
            <a
              href={`tel:${emergencyContact.phone.replace(/\s+/g, "")}`}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500"
            >
              Call now
            </a>
          </div>
        </section>
      ) : null}

      <PairingCard />
    </div>
  );
}

// --------------------------------------------------------------- Read-only

function ProfileReadOnly({
  profile,
  onEdit,
}: {
  profile: PatientProfile;
  onEdit: () => void;
}) {
  const age = computeAge(profile.birthDate);
  const hasAnyDetail = !!(
    profile.name ||
    profile.preferredName ||
    profile.birthDate ||
    profile.bloodType ||
    profile.allergies ||
    profile.medicalNotes ||
    profile.homeAddress
  );

  return (
    <>
      <header className="flex flex-col items-stretch gap-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              name={profile.name || "Patient"}
              src={profile.photo || undefined}
              size="xl"
              hue="cyan"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
                {profile.preferredName ? `Goes by ${profile.preferredName}` : "Profile"}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                {profile.name || "Your profile"}
              </h1>
              {age !== null ? (
                <p className="mt-1 text-sm text-slate-600">
                  {age} years old · {profile.bloodType || "Blood type unknown"}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  {hasAnyDetail ? profile.bloodType || " " : "Add your details to personalise your home screen."}
                </p>
              )}
            </div>
          </div>
          <Button onClick={onEdit} icon={<Pencil size={14} />} size="sm" variant="secondary">
            {hasAnyDetail ? "Edit details" : "Add details"}
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field icon={<Cake size={14} />} label="Date of birth" value={formatBirthDate(profile.birthDate)} />
        <Field icon={<Droplet size={14} />} label="Blood type" value={profile.bloodType || "—"} />
        <Field icon={<HomeIcon size={14} />} label="Home address" value={profile.homeAddress || "—"} />
        <Field
          icon={<ShieldAlert size={14} />}
          label="Allergies"
          value={profile.allergies || "None recorded"}
          tone={profile.allergies ? "warning" : "default"}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <FileText size={14} aria-hidden />
          Medical notes
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {profile.medicalNotes || (
            <span className="text-slate-400">
              No notes yet. Tap Edit details to add any medication, diagnoses, or things a
              caregiver should know.
            </span>
          )}
        </p>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Editor

function ProfileEditor({
  profile,
  onSave,
  onCancel,
}: {
  profile: PatientProfile;
  onSave: (next: PatientProfile) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PatientProfile>(profile);
  useEffect(() => setDraft(profile), [profile]);

  const set = <K extends keyof PatientProfile>(key: K, value: PatientProfile[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
      className="space-y-4"
    >
      <header className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft) sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
            Editing your details
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-slate-900">
            Your profile
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            You can change this anytime. Your paired caregiver also sees and can edit it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" icon={<X size={14} />} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" icon={<Check size={14} />}>
            Save
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Full name"
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder="e.g. Sam Brown"
        />
        <Input
          label="Preferred name"
          value={draft.preferredName}
          onChange={(v) => set("preferredName", v)}
          placeholder="What should we call you on Home?"
        />
        <Input
          label="Date of birth"
          type="date"
          value={draft.birthDate}
          onChange={(v) => set("birthDate", v)}
        />
        <Input
          label="Blood type"
          value={draft.bloodType}
          onChange={(v) => set("bloodType", v)}
          placeholder="A+, O-, etc."
          maxLength={4}
        />
        <Input
          label="Home address"
          value={draft.homeAddress}
          onChange={(v) => set("homeAddress", v)}
          placeholder="Where you live"
          colSpan={2}
        />
        <Input
          label="Allergies"
          value={draft.allergies}
          onChange={(v) => set("allergies", v)}
          placeholder="Penicillin, peanuts, etc."
          colSpan={2}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Medical notes
          </span>
          <textarea
            value={draft.medicalNotes}
            onChange={(e) => set("medicalNotes", e.target.value)}
            rows={4}
            placeholder="Medications, diagnoses, accessibility needs — anything a caregiver should know."
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          />
        </label>
      </section>
    </form>
  );
}

// ---------------------------------------------------------- Sub-components

function Field({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white shadow-(--shadow-soft)"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span aria-hidden>{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  colSpan,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  maxLength?: number;
  colSpan?: 1 | 2;
}) {
  return (
    <label className={colSpan === 2 ? "sm:col-span-2 block" : "block"}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
      />
    </label>
  );
}

function computeAge(isoDate: string): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return years;
}

function formatBirthDate(isoDate: string): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
