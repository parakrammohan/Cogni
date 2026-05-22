import { AlertTriangle, Home, MapPin } from "lucide-react";
import GeofencePanel from "../../components/panels/GeofencePanel";
import { pointInPolygon, type GeofenceSettings } from "../../features/location/lib/geofence";
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
  // Header status pill on the right. Computed here (caregiver side)
  // because zones live in the caregiver's local storage; the patient
  // never has them, so any patient-side outOfBounds flag is unreliable.
  const latest = locationAnalysis.latest;
  const hasZones = geofence.zones.length > 0;
  const insideAnyZone =
    !!latest && hasZones && geofence.zones.some((z) => pointInPolygon(latest, z.polygon));
  const outsideSafeZone = !!latest && hasZones && !insideAnyZone;
  const homeZone = hasZones ? geofence.zones.find((z) => z.isHome) ?? null : null;
  const insideHome = !!latest && !!homeZone && pointInPolygon(latest, homeZone.polygon);
  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
          {t("mapScene.spatialTelemetry")}
        </h1>
        {/* Geofence status pill — moved off the map overlay so it can't
            be missed under the patient marker / breadcrumb polyline.
            Three states: outside (red), inside-home (cyan), inside any
            non-home zone (emerald). Hidden until zones exist. */}
        {hasZones && latest ? (
          outsideSafeZone ? (
            <span className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 shadow-sm">
              <AlertTriangle size={16} aria-hidden />
              Outside every safe zone
            </span>
          ) : insideHome ? (
            <span className="inline-flex items-center gap-2 rounded-xl border-2 border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 shadow-sm">
              <Home size={16} aria-hidden />
              Inside {homeZone!.name} · dwelling alerts paused
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
              <MapPin size={16} aria-hidden />
              Inside a safe zone
            </span>
          )
        ) : (
          <span className="text-xs text-slate-500">
            {t("mapScene.drawZonesPickAlertModesPerZoneTo")}
          </span>
        )}
      </header>
      <GeofencePanel
        analysis={locationAnalysis}
        settings={geofence}
        onSettingsChange={onGeofenceChange}
        wanderingActive={wanderingActive}
        scenarioLabel={
          locationScenario === "home"
            ? t("mapScene.homeLoop")
            : locationScenario === "pacing"
              ? t("mapScene.corridorPacing")
              : t("mapScene.dwellingOutsideZone")
        }
      />
    </div>
  );
}
