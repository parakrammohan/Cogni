import MapPanel from "../../components/panels/MapPanel";
import type { LocationAnalysis, SafeZone } from "../../types/app";

interface MapSceneProps {
  locationAnalysis: LocationAnalysis;
  locationScenario: string;
  safeZone: SafeZone;
  onResetSafeZone: () => void;
  onSafeZoneChange: (next: SafeZone) => void;
}

export function MapScene({
  locationAnalysis,
  locationScenario,
  safeZone,
  onResetSafeZone,
  onSafeZoneChange,
}: MapSceneProps) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          Spatial telemetry
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
          Drag the marker on the map or use the radius slider to update the safe zone. The
          alerts engine watches this perimeter continuously.
        </p>
      </header>
      <MapPanel
        analysis={locationAnalysis}
        onResetSafeZone={onResetSafeZone}
        onSafeZoneChange={onSafeZoneChange}
        scenarioLabel={
          locationScenario === "home"
            ? "Home loop"
            : locationScenario === "pacing"
              ? "Corridor pacing"
              : "Dwelling outside zone"
        }
        safeZone={safeZone}
      />
    </div>
  );
}
