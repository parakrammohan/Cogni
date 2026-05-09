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
} from "react-leaflet";

import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
import { formatDuration, formatMeters } from "../../lib/utils";
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

function DraggableSafeZoneMarker({
  safeZone,
  onSafeZoneChange,
}: Pick<MapPanelProps, "safeZone" | "onSafeZoneChange">) {
  return (
    <Marker
      draggable
      eventHandlers={{
        dragend: (event) => {
          const latLng = event.target.getLatLng();
          onSafeZoneChange({ ...safeZone, lat: latLng.lat, lng: latLng.lng });
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
  const trail = analysis.breadcrumbTrail.map(
    (point) => [point.lat, point.lng] as [number, number],
  );
  const lastPoint = trail.at(-1);
  const dwellingCenter = analysis.breadcrumbTrail.length
    ? ([
        analysis.breadcrumbTrail.reduce((sum, p) => sum + p.lat, 0) /
          analysis.breadcrumbTrail.length,
        analysis.breadcrumbTrail.reduce((sum, p) => sum + p.lng, 0) /
          analysis.breadcrumbTrail.length,
      ] as [number, number])
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Spatial telemetry
            </div>
            <div className="mt-0.5 text-base font-semibold text-slate-900">{scenarioLabel}</div>
          </div>
          <Badge tone={analysis.outOfBounds ? "danger" : "good"}>
            {analysis.outOfBounds ? "Outside zone" : "Inside zone"}
          </Badge>
        </div>
        <div className="relative h-[340px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <MapContainer
            center={[safeZone.lat, safeZone.lng]}
            zoom={16}
            scrollWheelZoom
            className="h-full w-full"
          >
            <MapViewportSync safeZone={safeZone} />
            <DraggableSafeZoneMarker safeZone={safeZone} onSafeZoneChange={onSafeZoneChange} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Circle
              center={[safeZone.lat, safeZone.lng]}
              radius={safeZone.radiusM}
              pathOptions={{
                color: "#0e7490",
                fillColor: "#0e7490",
                fillOpacity: 0.10,
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
                pathOptions={{ color: "#0f172a", weight: 3, opacity: 0.7 }}
              />
            ) : null}
            {trail.map((point, index) => {
              const isLatest = index === trail.length - 1;
              return (
                <CircleMarker
                  key={`${point[0]}-${point[1]}-${index}`}
                  center={point}
                  radius={isLatest ? 7 : 3}
                  pathOptions={{
                    color: isLatest ? "#ff6f4d" : "#0e7490",
                    fillColor: isLatest ? "#ff6f4d" : "#0e7490",
                    fillOpacity: 0.9,
                    weight: isLatest ? 3 : 1,
                  }}
                />
              );
            })}
            {analysis.dwelling.active && dwellingCenter ? (
              <Circle
                center={dwellingCenter}
                radius={Math.max(18, analysis.dwelling.diagonal * 2)}
                pathOptions={{
                  color: "#ef4444",
                  fillColor: "#ef4444",
                  fillOpacity: 0.15,
                  weight: 2,
                  dashArray: "6 6",
                }}
              />
            ) : null}
          </MapContainer>
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-700 shadow-sm backdrop-blur">
            OpenStreetMap live tiles
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-cyan-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-800 shadow-sm backdrop-blur">
            Drag the marker to move the safe zone
          </div>
        </div>
        {lastPoint ? (
          <div className="mt-3 text-xs text-slate-500">
            Latest fix: {lastPoint[0].toFixed(5)}, {lastPoint[1].toFixed(5)}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3">
        <SummaryCard
          label="Distance to safe zone"
          value={formatMeters(analysis.currentDistance)}
          message={
            analysis.outOfBounds
              ? "Geofence breached. Caregiver escalation is armed."
              : "Patient remains within the caregiver-defined perimeter."
          }
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Safe-zone radius
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {Math.round(safeZone.radiusM)}{" "}
                <span className="text-base font-normal text-slate-500">m</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Center {safeZone.lat.toFixed(5)}, {safeZone.lng.toFixed(5)}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={onResetSafeZone}>
              Reset
            </Button>
          </div>
          <div className="mt-3">
            <Slider
              aria-label="Safe zone radius in meters"
              min={40}
              max={320}
              step={5}
              value={[safeZone.radiusM]}
              onValueChange={(values) => {
                const next = values[0];
                if (typeof next === "number") {
                  onSafeZoneChange({ ...safeZone, radiusM: next });
                }
              }}
            />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>40 m</span>
              <span>320 m</span>
            </div>
          </div>
        </div>
        <SummaryCard
          label="Dwelling window"
          value={
            analysis.dwelling.active ? `${Math.round(analysis.dwelling.diagonal)} m box` : "Clear"
          }
          message={
            analysis.dwelling.duration
              ? `Observed for ${formatDuration(analysis.dwelling.duration)}.`
              : "Need more samples to evaluate dwelling state."
          }
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  message,
}: {
  label: string;
  value: string;
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft)">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
    </div>
  );
}
