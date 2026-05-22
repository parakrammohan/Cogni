import {
  Cake,
  Check,
  Droplet,
  FileText,
  Home as HomeIcon,
  Lock,
  Pencil,
  ShieldAlert,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { AccountSettingsCard } from "../../auth/AccountSettingsCard";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { PairingCard } from "../../components/PairingCard";
import type { CareContact, PatientProfile } from "../../features/care/types";
import { useTranslation } from "react-i18next";
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
export function ProfileScene({ profile, emergencyContact, onProfileChange }: ProfileSceneProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const locked = profile.caregiverLocked;
  return (
    <div className="space-y-6">
      {editing && !locked ? (
        <ProfileEditor
          profile={profile}
          onSave={(next) => {
            onProfileChange(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ProfileReadOnly profile={profile} locked={locked} onEdit={() => setEditing(true)} />
      )}
      {locked ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t("profileScene.editingIsLockedByYourCaregiver")}</p>
            <p className="mt-0.5 text-xs leading-5">
              {t("profileScene.yourPairedCaregiverHasTurnedOffS")}
            </p>
          </div>
        </div>
      ) : null}

      {emergencyContact ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-red-700">
            {t("profileScene.inAnEmergency")}
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
              {t("profileScene.callNow")}
            </a>
          </div>
        </section>
      ) : null}

      <AccountSettingsCard />

      <PairingCard />
    </div>
  );
}

// --------------------------------------------------------------- Read-only

function ProfileReadOnly({
  profile,
  locked,
  onEdit,
}: {
  profile: PatientProfile;
  locked: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
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
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
                {profile.preferredName
                  ? `Goes by ${profile.preferredName}`
                  : t("profileScene.profile")}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                {profile.name || "Your profile"}
              </h1>
              {age !== null ? (
                <p className="mt-1 text-sm text-slate-600">
                  {age} {t("profileScene.yearsOld")} {profile.bloodType || "Blood type unknown"}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  {hasAnyDetail
                    ? profile.bloodType || " "
                    : t("profileScene.addYourDetailsToPersonaliseYourH")}
                </p>
              )}
            </div>
          </div>
          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
              <Lock size={12} aria-hidden />
              {t("profileScene.locked")}
            </span>
          ) : (
            <Button onClick={onEdit} icon={<Pencil size={14} />} size="sm" variant="secondary">
              {hasAnyDetail ? t("profileScene.editDetails") : t("profileScene.addDetails")}
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field
          icon={<Cake size={14} />}
          label={t("profileScene.dateOfBirth")}
          value={formatBirthDate(profile.birthDate)}
        />
        <Field
          icon={<Droplet size={14} />}
          label={t("profileScene.bloodType")}
          value={profile.bloodType || "—"}
        />
        <Field
          icon={<HomeIcon size={14} />}
          label={t("profileScene.homeAddress")}
          value={profile.homeAddress || "—"}
        />
        <Field
          icon={<ShieldAlert size={14} />}
          label={t("profileScene.allergies")}
          value={profile.allergies || "None recorded"}
          tone={profile.allergies ? "warning" : "default"}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <FileText size={14} aria-hidden />
          {t("profileScene.medicalNotes")}
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {profile.medicalNotes || (
            <span className="text-slate-400">
              {t("profileScene.noNotesYetTapEditDetailsToAddAny")}
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
  const { t } = useTranslation();
  // Initialise the draft from `profile` ONCE on mount. Do NOT re-sync
  // whenever the prop changes — TanStack Query refetches (window
  // focus, cache invalidation after a sibling mutation, etc.)
  // produce a new `profile` object every time, and a resync effect
  // would silently overwrite the user's in-progress edits mid-
  // keystroke. The draft is committed back to the server on Save.
  const [draft, setDraft] = useState<PatientProfile>(profile);

  // Snapshot the server-side `updated_at` we were viewing when the
  // edit started. If a caregiver writes to the same row while we're
  // typing, the live `profile.updatedAt` advances; on Save we compare
  // and prompt before silently overwriting their changes. Captured in
  // a ref so subsequent prop updates don't bump the baseline.
  const baselineUpdatedAt = useRef(profile.updatedAt);
  const set = <K extends keyof PatientProfile>(key: K, value: PatientProfile[K]) =>
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const liveUpdatedAt = profile.updatedAt;
    const conflict =
      !!baselineUpdatedAt.current && !!liveUpdatedAt && liveUpdatedAt !== baselineUpdatedAt.current;
    if (conflict) {
      const ok = window.confirm(
        "Your caregiver edited this profile while you were typing. " +
          "Saving now will overwrite their changes with yours. Continue?",
      );
      if (!ok) {
        // Refresh baseline to current; user can re-decide after a beat.
        baselineUpdatedAt.current = liveUpdatedAt;
        return;
      }
    }
    onSave(draft);
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft) sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
            {t("profileScene.editingYourDetails")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-slate-900">
            {t("profileScene.yourProfile")}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {t("profileScene.youCanChangeThisAnytimeYourPaire")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<X size={14} />}
            onClick={onCancel}
          >
            {t("profileScene.cancel")}
          </Button>
          <Button type="submit" size="sm" icon={<Check size={14} />}>
            {t("profileScene.save")}
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t("profileScene.fullName")}
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder={t("profileScene.eGSamBrown")}
        />
        <Input
          label={t("profileScene.preferredName")}
          value={draft.preferredName}
          onChange={(v) => set("preferredName", v)}
          placeholder={t("profileScene.whatShouldWeCallYouOnHome")}
        />
        <Input
          label={t("profileScene.dateOfBirth")}
          type="date"
          value={draft.birthDate}
          onChange={(v) => set("birthDate", v)}
        />
        <Input
          label={t("profileScene.bloodType")}
          value={draft.bloodType}
          onChange={(v) => set("bloodType", v)}
          placeholder={t("profileScene.aOEtc")}
          maxLength={4}
        />
        <Input
          label={t("profileScene.homeAddress")}
          value={draft.homeAddress}
          onChange={(v) => set("homeAddress", v)}
          placeholder={t("profileScene.whereYouLive")}
          colSpan={2}
        />
        <Input
          label={t("profileScene.allergies")}
          value={draft.allergies}
          onChange={(v) => set("allergies", v)}
          placeholder={t("profileScene.penicillinPeanutsEtc")}
          colSpan={2}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("profileScene.medicalNotes")}
          </span>
          <textarea
            value={draft.medicalNotes}
            onChange={(e) => set("medicalNotes", e.target.value)}
            rows={4}
            placeholder={t("profileScene.medicationsDiagnosesAccessibilit")}
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
  const { t } = useTranslation();
  return (
    <div
      className={`rounded-2xl border p-4 ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white shadow-(--shadow-soft)"}`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
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
  const { t } = useTranslation();
  return (
    <label className={colSpan === 2 ? "sm:col-span-2 block" : "block"}>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
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
