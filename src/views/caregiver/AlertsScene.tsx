import AlertsPanel from "../../components/panels/AlertsPanel";
import type { AppAlert } from "../../types/app";
import { useTranslation } from "react-i18next";
interface AlertsSceneProps {
  alerts: AppAlert[];
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
}
export function AlertsScene({ alerts, clearAlerts, dismissAlert }: AlertsSceneProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          {t("alertsScene.notifications")}
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          {t("alertsScene.anomaliesSurfacedByTheLocationMo")}
        </p>
      </header>
      <AlertsPanel alerts={alerts} onClearAll={clearAlerts} onDismiss={dismissAlert} />
    </div>
  );
}
