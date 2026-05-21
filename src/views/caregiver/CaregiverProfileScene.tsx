import { useAuth } from "../../auth/AuthContext";
import { AccountSettingsCard } from "../../auth/AccountSettingsCard";
import { PairingCard } from "../../components/PairingCard";

/**
 * Caregiver's *own* account — identity + pairing. Sits separately
 * from Manage (which is the patient's data).
 */
import { useTranslation } from "react-i18next";
export function CaregiverProfileScene() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const initials = (user.display_name || user.username)
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-(--shadow-soft)">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 text-base font-semibold text-white">
            {initials || "U"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
              {t("caregiverProfileScene.account")}
            </p>
            <h1 className="mt-0.5 truncate font-display text-2xl font-semibold text-slate-900">
              {user.display_name}
            </h1>
            <p className="truncate text-sm text-slate-500">
              @{user.username} · <span className="capitalize">{user.role}</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {t("caregiverProfileScene.thePatientSCareRecordAllergiesCo")}{" "}
          <strong className="text-slate-700">{t("caregiverProfileScene.manage")}</strong>
          {t("caregiverProfileScene.notHereUseThisPageToManageYourAc")}
        </p>
      </section>

      <AccountSettingsCard />

      <PairingCard />
    </div>
  );
}
