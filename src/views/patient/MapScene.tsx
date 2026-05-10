import { divIcon } from "leaflet";
import { Compass, MapPinned, Navigation } from "lucide-react";
import { useEffect, useMemo } from "react";
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

import { Button } from "../../components/ui/Button";
import { formatMeters } from "../../lib/utils";
import type { LocationAnalysis, SafeZone, SensorState } from "../../types/app";

interface MapSceneProps {
  analysis: LocationAnalysis;
  safeZone: SafeZone;
  geoStatus: SensorState;
  onEnableLocation: () => void;
}

const safeZoneMarkerIcon = divIcon({
  className: "safe-zone-marker",
  html: '<span class="safe-zone-marker__dot"></span><span class="safe-zone-marker__pulse"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/**
 * Read-only patient map. Surfaces:
 *   - Their position on real OpenStreetMap tiles
 *   - The safe zone the caregiver defined
 *   - Recent breadcrumb trail
 *   - A directional indicator showing their last direction of travel
 *
 * The patient cannot move the safe zone — that's caregiver-only.
 */
export function MapScene({ analysis, safeZone, geoStatus, onEnableLocation }: MapSceneProps) {
  if (geoStatus !== "live" && geoStatus !== "simulation") {
    return <EmptyState onEnableLocation={onEnableLocation} />;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          My location
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          Where you are right now and the safe area your caregiver set up. The arrow shows your
          recent direction of travel.
        </p>
      </header>

      <MapCard analysis={analysis} safeZone={safeZone} />

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          icon={<MapPinned size={16} />}
          label="Distance from home"
          value={formatMeters(analysis.currentDistance)}
          tone={analysis.outOfBounds ? "warning" : "good"}
          message={
            analysis.outOfBounds
              ? `You're outside ${safeZone.name}. Try heading back if you can.`
              : `You're inside ${safeZone.name}. All steady.`
          }
        />
        <SummaryCard
          icon={<Navigation size={16} />}
          label="Heading"
          value={describeHeading(deriveHeading(analysis))}
          tone="good"
          message="Estimated from your most recent steps. May not match a real compass exactly."
        />
      </div>
    </div>
  );
}

function MapCard({
  analysis,
  safeZone,
}: {
  analysis: LocationAnalysis;
  safeZone: SafeZone;
}) {
  const heading = deriveHeading(analysis);
  const trail = analysis.breadcrumbTrail.map(
    (point) => [point.lat, point.lng] as [number, number],
  );
  const latest = analysis.latest;
  const patientIcon = useMemo(() => {
    const rotation = heading ?? 0;
    return divIcon({
      className: "patient-marker",
      html: `<span class="patient-marker__halo"></span><span class="patient-marker__arrow" style="transform: translate(-50%, -50%) rotate(${rotation}deg)"></span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    // We deliberately recreate the icon when heading changes so the rotation persists
    // through Leaflet's render cycle.
  }, [heading]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
      <div className="relative h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-[440px]">
        <MapContainer
          center={[safeZone.lat, safeZone.lng]}
          zoom={16}
          scrollWheelZoom={false}
          zoomControl={false}
          dragging
          doubleClickZoom
          className="h-full w-full"
        >
          <CenterOnPatient analysis={analysis} fallback={safeZone} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            icon={safeZoneMarkerIcon}
            position={[safeZone.lat, safeZone.lng]}
            interactive={false}
          >
            <Tooltip direction="top" offset={[0, -10]} permanent>
              {safeZone.name}
            </Tooltip>
          </Marker>
          <Circle
            center={[safeZone.lat, safeZone.lng]}
            radius={safeZone.radiusM}
            pathOptions={{
              color: "#0e7490",
              fillColor: "#0e7490",
              fillOpacity: 0.1,
              weight: 2,
            }}
          />
          {trail.length > 1 ? (
            <Polyline
              positions={trail}
              pathOptions={{ color: "#0f172a", weight: 3, opacity: 0.6 }}
            />
          ) : null}
          {trail.slice(0, -1).map((point, index) => (
            <CircleMarker
              key={`${point[0]}-${point[1]}-${index}`}
              center={point}
              radius={3}
              pathOptions={{
                color: "#0e7490",
                fillColor: "#0e7490",
                fillOpacity: 0.5,
                weight: 1,
              }}
            />
          ))}
          {latest ? (
            <Marker
              icon={patientIcon}
              position={[latest.lat, latest.lng]}
              interactive={false}
            />
          ) : null}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-700 shadow-sm backdrop-blur">
          <Compass size={11} aria-hidden />
          Live map
        </div>
      </div>
    </div>
  );
}

function CenterOnPatient({
  analysis,
  fallback,
}: {
  analysis: LocationAnalysis;
  fallback: SafeZone;
}) {
  const map = useMap();
  useEffect(() => {
    const target = analysis.latest ?? fallback;
    map.panTo([target.lat, target.lng], { animate: true, duration: 0.45 });
  }, [analysis.latest?.lat, analysis.latest?.lng, fallback.lat, fallback.lng, map]);
  return null;
}

function SummaryCard({
  icon,
  label,
  value,
  message,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  message: string;
  tone: "good" | "warning";
}) {
  const surface =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-4 shadow-(--shadow-soft) ${surface}`}>
      <div className="flex items-center gap-2 text-slate-500">
        <span aria-hidden>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1 font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
        {value}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{message}</p>
    </div>
  );
}

function EmptyState({ onEnableLocation }: { onEnableLocation: () => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
          My location
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          See where you are on a map relative to your safe area.
        </p>
      </header>
      <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
            <MapPinned size={20} aria-hidden />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Location is off</h3>
            <p className="mt-1 max-w-md text-sm text-slate-700">
              Enable location to see your position on the map. We only use it to keep you safe.
            </p>
          </div>
          <Button onClick={onEnableLocation}>Enable location</Button>
        </div>
      </div>
    </div>
  );
}

function deriveHeading(analysis: LocationAnalysis): number | null {
  const trail = analysis.breadcrumbTrail;
  if (trail.length < 2) return null;
  // Use the last ~5 points to dampen jitter from a single noisy fix.
  const recent = trail.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last) return null;
  const dLat = last.lat - first.lat;
  const dLng = last.lng - first.lng;
  if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) return null;
  // Bearing in degrees, 0 = north, clockwise.
  const lat1 = (first.lat * Math.PI) / 180;
  const lat2 = (last.lat * Math.PI) / 180;
  const dLon = ((last.lng - first.lng) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function describeHeading(degrees: number | null): string {
  if (degrees === null) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(degrees / 45) % 8;
  return `${dirs[idx]} · ${Math.round(degrees)}°`;
}
