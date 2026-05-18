import { Clock as ClockIcon, Plus, Star, Trash2, Upload } from "lucide-react";
import { useRef, type ChangeEvent } from "react";

import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { cx } from "../../lib/utils";
import type {
  CareContact,
  CareMemory,
  CareReminder,
  PatientProfile,
} from "../../features/care/types";

interface ManageSceneProps {
  profile: PatientProfile;
  contacts: CareContact[];
  reminders: CareReminder[];
  memories: CareMemory[];
  onProfileChange: (next: PatientProfile) => void;
  onContactsChange: (next: CareContact[]) => void;
  onRemindersChange: (next: CareReminder[]) => void;
  onMemoriesChange: (next: CareMemory[]) => void;
}

export function ManageScene({
  profile,
  contacts,
  reminders,
  memories,
  onProfileChange,
  onContactsChange,
  onRemindersChange,
  onMemoriesChange,
}: ManageSceneProps) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Manage
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          Edit the patient profile, contacts, daily reminders, and photo memories. Everything
          here is saved locally and surfaces in the patient view.
        </p>
      </header>

      <ProfileEditor profile={profile} onChange={onProfileChange} />
      <ContactsEditor contacts={contacts} onChange={onContactsChange} />
      <RemindersEditor reminders={reminders} onChange={onRemindersChange} />
      <MemoriesEditor memories={memories} onChange={onMemoriesChange} />
    </div>
  );
}

// --- Profile -------------------------------------------------------------

function ProfileEditor({
  profile,
  onChange,
}: {
  profile: PatientProfile;
  onChange: (next: PatientProfile) => void;
}) {
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  function update<K extends keyof PatientProfile>(key: K, value: PatientProfile[K]) {
    onChange({ ...profile, [key]: value });
  }

  function handlePhotoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void readImageAsDataUrl(file).then((dataUrl) => update("photo", dataUrl));
  }

  return (
    <Section title="Patient profile" hint="Shown across the patient view">
      <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Avatar
            name={profile.name || "Patient"}
            src={profile.photo || undefined}
            size="xl"
            hue="cyan"
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoFile}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Upload size={14} />}
            onClick={() => photoInputRef.current?.click()}
          >
            {profile.photo ? "Change photo" : "Upload photo"}
          </Button>
          {profile.photo ? (
            <button
              type="button"
              onClick={() => update("photo", "")}
              className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              Remove photo
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <input
              type="text"
              value={profile.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Preferred name">
            <input
              type="text"
              value={profile.preferredName}
              onChange={(e) => update("preferredName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              value={profile.birthDate}
              onChange={(e) => update("birthDate", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Blood type">
            <input
              type="text"
              value={profile.bloodType}
              onChange={(e) => update("bloodType", e.target.value)}
              className={inputClass}
              placeholder="O+, A−, etc."
            />
          </Field>
          <Field label="Allergies" className="sm:col-span-2">
            <input
              type="text"
              value={profile.allergies}
              onChange={(e) => update("allergies", e.target.value)}
              className={inputClass}
              placeholder="Penicillin, peanuts…"
            />
          </Field>
          <Field label="Home address" className="sm:col-span-2">
            <input
              type="text"
              value={profile.homeAddress}
              onChange={(e) => update("homeAddress", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Medical notes" className="sm:col-span-2">
            <textarea
              value={profile.medicalNotes}
              onChange={(e) => update("medicalNotes", e.target.value)}
              className={`${inputClass} min-h-[80px] resize-y`}
            />
          </Field>
        </div>
      </div>
    </Section>
  );
}

// --- Contacts ------------------------------------------------------------

function ContactsEditor({
  contacts,
  onChange,
}: {
  contacts: CareContact[];
  onChange: (next: CareContact[]) => void;
}) {
  function update(id: string, patch: Partial<CareContact>) {
    onChange(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(id: string) {
    onChange(contacts.filter((c) => c.id !== id));
  }
  function add() {
    onChange([
      ...contacts,
      {
        id: `c-${Date.now()}`,
        name: "",
        relationship: "",
        phone: "",
        isEmergency: false,
        photo: "",
      },
    ]);
  }

  return (
    <Section
      title="Contacts"
      hint="Quick-call list shown to the patient"
      action={
        <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={add}>
          Add contact
        </Button>
      }
    >
      <ul className="grid gap-3 lg:grid-cols-2">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)"
          >
            <Avatar
              name={contact.name || "?"}
              src={contact.photo || undefined}
              size="md"
              hue={contact.isEmergency ? "rose" : undefined}
            />
            <div className="grid min-w-0 flex-1 gap-2">
              <input
                type="text"
                placeholder="Name"
                value={contact.name}
                onChange={(e) => update(contact.id, { name: e.target.value })}
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Relationship"
                  value={contact.relationship}
                  onChange={(e) => update(contact.id, { relationship: e.target.value })}
                  className={inputClass}
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={contact.phone}
                  onChange={(e) => update(contact.id, { phone: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => update(contact.id, { isEmergency: !contact.isEmergency })}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
                    contact.isEmergency
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Star size={12} aria-hidden />
                  {contact.isEmergency ? "Emergency" : "Mark emergency"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(contact.id)}
                  aria-label={`Delete ${contact.name || "contact"}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// --- Reminders -----------------------------------------------------------

function RemindersEditor({
  reminders,
  onChange,
}: {
  reminders: CareReminder[];
  onChange: (next: CareReminder[]) => void;
}) {
  function update(id: string, patch: Partial<CareReminder>) {
    onChange(reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(reminders.filter((r) => r.id !== id));
  }
  function add() {
    onChange([
      ...reminders,
      {
        id: `r-${Date.now()}`,
        label: "",
        time: "09:00",
        recurring: true,
        notes: "",
        completedAt: null,
      },
    ]);
  }
  return (
    <Section
      title="Daily reminders"
      hint="Surfaced on the patient home screen"
      action={
        <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={add}>
          Add reminder
        </Button>
      }
    >
      <ul className="grid gap-3">
        {reminders.map((reminder) => (
          <li
            key={reminder.id}
            className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft) sm:grid-cols-[12rem_1fr_auto]"
          >
            <ReminderTimePicker
              value={reminder.time}
              onChange={(v) => update(reminder.id, { time: v })}
            />
            <div className="grid gap-2">
              <input
                type="text"
                placeholder="Label (e.g. Morning medication)"
                value={reminder.label}
                onChange={(e) => update(reminder.id, { label: e.target.value })}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Notes (dosage, instructions)"
                value={reminder.notes}
                onChange={(e) => update(reminder.id, { notes: e.target.value })}
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(reminder.id)}
              aria-label={`Delete ${reminder.label || "reminder"}`}
              className="inline-flex h-9 w-9 items-center justify-center self-start rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Polished time picker for reminders.
 *
 * - Large, friendly 12h display of the current time.
 * - Native time input below for fine control.
 * - Quick-pick chips for the canonical reminder slots so caregivers
 *   can build a daily schedule without typing.
 */
function ReminderTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const PRESETS: ReadonlyArray<{ label: string; value: string }> = [
    { label: "Morning", value: "08:00" },
    { label: "Noon", value: "12:00" },
    { label: "Afternoon", value: "15:00" },
    { label: "Evening", value: "18:00" },
    { label: "Night", value: "21:00" },
  ];
  const formatted = formatTime12h(value);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-cyan-700">
          <ClockIcon size={14} />
        </span>
        <span className="font-mono text-lg font-semibold leading-none text-slate-900">
          {formatted}
        </span>
      </div>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const active = p.value === value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold transition " +
                (active
                  ? "bg-cyan-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-cyan-50 hover:text-cyan-700")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatTime12h(hhmm: string): string {
  const m = (hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "—";
  const h = Math.max(0, Math.min(23, parseInt(m[1]!, 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2]!, 10)));
  const period = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm.toString().padStart(2, "0")} ${period}`;
}

// --- Memories ------------------------------------------------------------

function MemoriesEditor({
  memories,
  onChange,
}: {
  memories: CareMemory[];
  onChange: (next: CareMemory[]) => void;
}) {
  function update(id: string, patch: Partial<CareMemory>) {
    onChange(memories.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function remove(id: string) {
    onChange(memories.filter((m) => m.id !== id));
  }
  function add() {
    onChange([
      ...memories,
      { id: `m-${Date.now()}`, caption: "", context: "", photo: "" },
    ]);
  }
  return (
    <Section
      title="Photo memories"
      hint="Captioned photos shown to the patient"
      action={
        <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={add}>
          Add memory
        </Button>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {memories.map((memory) => (
          <MemoryEditorCard
            key={memory.id}
            memory={memory}
            onUpdate={(patch) => update(memory.id, patch)}
            onDelete={() => remove(memory.id)}
          />
        ))}
      </ul>
    </Section>
  );
}

function MemoryEditorCard({
  memory,
  onUpdate,
  onDelete,
}: {
  memory: CareMemory;
  onUpdate: (patch: Partial<CareMemory>) => void;
  onDelete: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void readImageAsDataUrl(file).then((dataUrl) => onUpdate({ photo: dataUrl }));
  }
  return (
    <li className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100"
      >
        {memory.photo ? (
          <img src={memory.photo} alt={memory.caption} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-slate-500">
            Click to add photo
          </span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <input
        type="text"
        placeholder="Caption"
        value={memory.caption}
        onChange={(e) => onUpdate({ caption: e.target.value })}
        className={inputClass}
      />
      <input
        type="text"
        placeholder="When (e.g. December 2023)"
        value={memory.context}
        onChange={(e) => onUpdate({ context: e.target.value })}
        className={inputClass}
      />
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1 self-end text-xs text-slate-500 hover:text-red-600"
      >
        <Trash2 size={12} aria-hidden /> Remove
      </button>
    </li>
  );
}

// --- Shared --------------------------------------------------------------

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-200";

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft) sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
