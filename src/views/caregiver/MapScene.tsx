import GeofencePanel from "../../components/panels/GeofencePanel";
import type { GeofenceSettings } from "../../features/location/lib/geofence";
import type { LocationAnalysis } from "../../types/app";
import { useTranslation } from "react-i18next";
interface MapSceneProps {
  locationAnalysis: LocationAnalysis;
  locationScenario: string;
  geofence: GeofenceSettings;
  onGeofenceChange: (next: GeofenceSettings) => void;
  wanderingActive: boolean;
}
export function MapScene({
  locationAnalysis,
  locationScenario,
  geofence,
  onGeofenceChange,
  wanderingActive,
}: MapSceneProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
          {t("mapScene.spatialTelemetry")}
        </h1>
        <span className="text-xs text-slate-500">
          {t("mapScene.drawZonesPickAlertModesPerZoneTo")}
        </span>
      </header>
      <GeofencePanel
        analysis={locationAnalysis}
        settings={geofence}
        onSettingsChange={onGeofenceChange}
        wanderingActive={wanderingActive}
        scenarioLabel={
          locationScenario === "home"
            ? "Home loop"
            : locationScenario === "pacing"
              ? "Corridor pacing"
              : "Dwelling outside zone"
        }
      />
    </div>
  );
}
