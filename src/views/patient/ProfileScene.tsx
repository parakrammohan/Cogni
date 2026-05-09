import { Cake, Droplet, FileText, Home as HomeIcon, ShieldAlert } from "lucide-react";

import { Avatar } from "../../components/ui/Avatar";
import type { CareContact, PatientProfile } from "../../features/care/types";

interface ProfileSceneProps {
  profile: PatientProfile;
  emergencyContact?: CareContact;
}

export function ProfileScene({ profile, emergencyContact }: ProfileSceneProps) {
  const age = computeAge(profile.birthDate);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-white p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Avatar
            name={profile.name}
            src={profile.photo || undefined}
            size="xl"
            hue="cyan"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">
              {profile.preferredName ? `Goes by ${profile.preferredName}` : "Profile"}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              {profile.name}
            </h1>
            {age !== null ? (
              <p className="mt-1 text-sm text-slate-600">
                {age} years old · {profile.bloodType || "Blood type unknown"}
              </p>
            ) : null}
          </div>
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

      {profile.medicalNotes ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-(--shadow-soft)">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <FileText size={14} aria-hidden />
            Medical notes
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{profile.medicalNotes}</p>
        </section>
      ) : null}

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
    </div>
  );
}

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
