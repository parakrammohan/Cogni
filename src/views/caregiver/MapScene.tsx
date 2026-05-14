import GeofencePanel from "../../components/panels/GeofencePanel";
import type { GeofenceSettings } from "../../features/location/lib/geofence";
import type { LocationAnalysis } from "../../types/app";

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
  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
          Spatial telemetry
        </h1>
        <span className="text-xs text-slate-500">
          Draw zones · pick alert modes per zone · toggle wandering globally
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
