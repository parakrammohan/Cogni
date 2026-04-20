import { useEffect } from "react";
import { divIcon } from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { formatDuration, formatMeters } from "../../lib/utils";
import Badge from "../ui/Badge";
import type { LocationAnalysis, SafeZone } from "../../types/app";

interface MapPanelProps {
  analysis: LocationAnalysis;
  onResetSafeZone: () => void;
  onSafeZoneChange: (next: SafeZone) => void;
  scenarioLabel: string;
  safeZone: SafeZone;
}

const safeZoneMarker = divIcon({
  className: "safe-zone-marker",
  html: '<span class="safe-zone-marker__dot"></span><span class="safe-zone-marker__pulse"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function MapViewportSync({ safeZone }: { safeZone: SafeZone }) {
  const map = useMap();

  useEffect(() => {
    map.panTo([safeZone.lat, safeZone.lng], { animate: true, duration: 0.45 });
  }, [map, safeZone.lat, safeZone.lng]);

  return null;
}

function SafeZoneEditor({
  safeZone,
  onSafeZoneChange,
}: Pick<MapPanelProps, "safeZone" | "onSafeZoneChange">) {
  useMapEvents({
    click(event) {
      onSafeZoneChange({
        ...safeZone,
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return (
    <Marker
      draggable
      eventHandlers={{
        dragend: (event) => {
          const latLng = event.target.getLatLng();
          onSafeZoneChange({
            ...safeZone,
            lat: latLng.lat,
            lng: latLng.lng,
          });
        },
      }}
      icon={safeZoneMarker}
      position={[safeZone.lat, safeZone.lng]}
    >
      <Tooltip direction="top" offset={[0, -12]}>
        Drag to move safe zone center
      </Tooltip>
    </Marker>
  );
}

export default function MapPanel({
  analysis,
  onResetSafeZone,
  onSafeZoneChange,
  scenarioLabel,
  safeZone,
}: MapPanelProps) {
  const trail = analysis.breadcrumbTrail.map((point) => [point.lat, point.lng] as [number, number]);
  const latest = analysis.latest ? ([analysis.latest.lat, analysis.latest.lng] as [number, number]) : null;
  const dwellingCenter = analysis.breadcrumbTrail.length
    ? ([
        analysis.breadcrumbTrail.reduce((sum, point) => sum + point.lat, 0) / analysis.breadcrumbTrail.length,
        analysis.breadcrumbTrail.reduce((sum, point) => sum + point.lng, 0) / analysis.breadcrumbTrail.length,
      ] as [number, number])
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Spatial telemetry
            </div>
            <div className="mt-1 text-lg font-semibold text-white">{scenarioLabel}</div>
          </div>
          <Badge tone={analysis.outOfBounds ? "danger" : "good"}>
            {analysis.outOfBounds ? "Outside safe zone" : "Inside safe zone"}
          </Badge>
        </div>
        <div className="overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/80 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]">
          <div className="relative h-[320px] w-full">
            <MapContainer
              center={[safeZone.lat, safeZone.lng]}
              zoom={16}
              scrollWheelZoom
              className="h-full w-full"
            >
              <MapViewportSync safeZone={safeZone} />
              <SafeZoneEditor safeZone={safeZone} onSafeZoneChange={onSafeZoneChange} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Circle
                center={[safeZone.lat, safeZone.lng]}
                radius={safeZone.radiusM}
                pathOptions={{
                  color: "#6de2ff",
                  fillColor: "#6de2ff",
                  fillOpacity: 0.12,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} permanent>
                  Safe zone
                </Tooltip>
              </Circle>
              {trail.length > 1 ? (
                <Polyline
                  positions={trail}
                  pathOptions={{
                    color: "#edf5f2",
                    weight: 4,
                    opacity: 0.9,
                  }}
                />
              ) : null}
              {trail.map((point, index) => (
                <CircleMarker
                  key={`${point[0]}-${point[1]}-${index}`}
                  center={point}
                  radius={index === trail.length - 1 ? 8 : 4}
                  pathOptions={{
                    color: index === trail.length - 1 ? "#ff6f4d" : "#6de2ff",
                    fillColor: index === trail.length - 1 ? "#ff6f4d" : "#6de2ff",
                    fillOpacity: 0.92,
                    weight: index === trail.length - 1 ? 3 : 1,
                  }}
                />
              ))}
              {analysis.dwelling.active && dwellingCenter ? (
                <Circle
                  center={dwellingCenter}
                  radius={Math.max(18, analysis.dwelling.diagonal * 2)}
                  pathOptions={{
                    color: "#ff6f4d",
                    fillColor: "#ff6f4d",
                    fillOpacity: 0.15,
                    weight: 2,
                    dashArray: "6 6",
                  }}
                />
              ) : null}
            </MapContainer>
            <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-slate-950/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white">
              OpenStreetMap live tiles
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-cyan/20 bg-slate-950/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan">
              Drag marker or click map to move safe zone
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Distance to safe zone</div>
          <div className="mt-2 text-3xl font-semibold text-white">{formatMeters(analysis.currentDistance)}</div>
          <p className="mt-2 text-sm text-slate-300">
            {analysis.outOfBounds
              ? "Geofence breached. Caregiver escalation is armed."
              : "Patient remains within caregiver-defined perimeter."}
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Perimeter editor</div>
              <div className="mt-2 text-2xl font-semibold text-white">{Math.round(safeZone.radiusM)} m</div>
              <p className="mt-2 text-sm text-slate-300">
                Center {safeZone.lat.toFixed(5)}, {safeZone.lng.toFixed(5)}
              </p>
            </div>
            <button
              onClick={onResetSafeZone}
              className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/14"
            >
              Reset
            </button>
          </div>
          <input
            type="range"
            min={40}
            max={320}
            step={5}
            value={safeZone.radiusM}
            onChange={(event) =>
              onSafeZoneChange({
                ...safeZone,
                radiusM: Number(event.target.value),
              })
            }
            className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan"
          />
          <p className="mt-3 text-sm text-slate-300">
            Adjust the caregiver perimeter directly on the map. Route profiles will re-center around the updated zone.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
          <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Dwelling window</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {analysis.dwelling.active ? `${Math.round(analysis.dwelling.diagonal)} m box` : "No lost pattern"}
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {analysis.dwelling.duration
              ? `Observed for ${formatDuration(analysis.dwelling.duration)}.`
              : "Need more samples to evaluate dwelling state."}
          </p>
        </div>
      </div>
    </div>
  );
}
