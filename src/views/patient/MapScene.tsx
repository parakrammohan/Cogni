import L, { divIcon } from "leaflet";
import { Compass, Crosshair, MapPinned, Navigation } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
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
import { cx } from "../../lib/utils";
import type { LocationAnalysis, SafeZone, SensorState } from "../../types/app";
import { useTranslation } from "react-i18next";
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
 * Read-only patient map. Single full-height stage with the map filling the
 * available space and two compact status pills floating on top — no
 * vertical scroll.
 */
export function MapScene({ analysis, safeZone, geoStatus, onEnableLocation }: MapSceneProps) {
  const { t } = useTranslation();
  if (geoStatus !== "live" && geoStatus !== "simulation") {
    return <EmptyState onEnableLocation={onEnableLocation} />;
  }
  const heading = deriveHeading(analysis);
  const mapRef = useRef<L.Map | null>(null);
  const recenter = useCallback(() => {
    const map = mapRef.current;
    const target = analysis.latest ?? safeZone;
    if (!map) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), {
      animate: true,
      duration: 0.5,
    });
  }, [analysis.latest?.lat, analysis.latest?.lng, safeZone.lat, safeZone.lng]);
  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="font-display text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
          {t("mapScene.myLocation")}
        </h1>
        {/* Header subtitle used to read "Inside Home Base" / "Outside
            Home Base", referencing the hardcoded safe-zone constant
            that no caregiver actually placed. Until home-base wiring
            from geofence_zones lands, we don't claim there is one. */}
      </header>

      {/* `isolate` creates a stacking context so Leaflet's z-index 1000
          zoom controls + our z-[1001] overlay pills stay below the
          mobile BottomNav (z-[1050]) instead of bleeding through. */}
      <div className="relative isolate w-full min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-(--shadow-soft)">
        <MapBackground analysis={analysis} safeZone={safeZone} heading={heading} mapRef={mapRef} />

        {/* Distance-from-home widget removed: the hardcoded SAFE_ZONE
            (Singapore default) used to anchor it isn't an actual
            caregiver-placed home, so the number was decorative. Will
            return wired to the geofence_zones home base once that's
            implemented. */}

        {/* Heading widget — top-right */}
        <FloatingWidget className="right-3 top-3">
          <WidgetRow
            icon={<Navigation size={14} />}
            label={t("mapScene.heading")}
            value={describeHeading(heading)}
            tone="good"
            hint={t("mapScene.estimatedFromYourRecentSteps")}
          />
        </FloatingWidget>

        {/* Recenter button — bottom-right above the attribution */}
        <button
          type="button"
          onClick={recenter}
          aria-label={t("mapScene.centerMapOnMyPosition")}
          className="pointer-events-auto absolute bottom-3 right-3 z-[1001] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-cyan-50 hover:text-cyan-700 hover:ring-cyan-300 active:scale-95"
        >
          <Crosshair size={18} aria-hidden />
        </button>

        {/* Live tile attribution — bottom-left */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1001] inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-sm backdrop-blur">
          <Compass size={11} aria-hidden />
          {t("mapScene.liveMap")}
        </div>
      </div>
    </div>
  );
}
function MapBackground({
  analysis,
  safeZone,
  heading,
  mapRef,
}: {
  analysis: LocationAnalysis;
  safeZone: SafeZone;
  heading: number | null;
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const { t } = useTranslation();
  const trail = analysis.breadcrumbTrail.map((point) => [point.lat, point.lng] as [number, number]);
  const latest = analysis.latest;
  const patientIcon = useMemo(() => {
    const rotation = heading ?? 0;
    return divIcon({
      className: "patient-marker",
      html: `<span class="patient-marker__halo"></span><span class="patient-marker__arrow" style="transform: translate(-50%, -50%) rotate(${rotation}deg)"></span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }, [heading]);
  return (
    <MapContainer
      center={[safeZone.lat, safeZone.lng]}
      zoom={16}
      scrollWheelZoom
      zoomControl
      dragging
      doubleClickZoom
      className="absolute inset-0 h-full w-full"
    >
      <CaptureMap mapRef={mapRef} />
      <CenterOnPatient analysis={analysis} fallback={safeZone} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {/* Home Base marker + radius circle was previously rendered here
          from the hardcoded SAFE_ZONE constant (Singapore default), even
          when no one had actually placed a home. That misled patients
          into thinking there was a configured home base when in fact
          the data was just app-provided filler. With the geofence_zones
          system, only zones explicitly drawn by the caregiver should
          appear on the map — the hardcoded marker is gone. */}
      {trail.length > 1 ? (
        <Polyline
          positions={trail}
          pathOptions={{
            color: "#0f172a",
            weight: 3,
            opacity: 0.6,
          }}
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
        <Marker icon={patientIcon} position={[latest.lat, latest.lng]} interactive={false} />
      ) : null}
    </MapContainer>
  );
}
function FloatingWidget({ className, children }: { className?: string; children: ReactNode }) {
  const { t } = useTranslation();
  // z-[1001] sits above every Leaflet pane (max z-index 1000 for the
  // built-in zoom controls) so floating widgets aren't covered by the
  // map when the user pans / zooms.
  return (
    <div
      className={cx(
        "pointer-events-auto absolute z-[1001] max-w-[14rem] rounded-2xl bg-white/95 px-3 py-2 shadow-md ring-1 ring-slate-200 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}
function WidgetRow({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "good" | "warning";
  hint?: string;
}) {
  const { t } = useTranslation();
  const dot = tone === "warning" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <span className={cx("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        <span aria-hidden>{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 font-display text-lg font-semibold leading-5 text-slate-900 sm:text-xl">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs leading-4 text-slate-500">{hint}</div> : null}
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
  // Pan ONCE on the first real location, then never again. The
  // previous version re-centered on every analysis.latest update,
  // which on a live GPS feed (1+ Hz) yanked the map back to the
  // patient every second and made manual panning impossible. The
  // recenter button on screen re-runs flyTo on demand.
  const didInitialPanRef = useRef(false);
  useEffect(() => {
    if (didInitialPanRef.current) return;
    const target = analysis.latest ?? fallback;
    map.panTo([target.lat, target.lng], { animate: true, duration: 0.45 });
    if (analysis.latest) didInitialPanRef.current = true;
  }, [analysis.latest?.lat, analysis.latest?.lng, fallback.lat, fallback.lng, map, analysis.latest]);
  return null;
}

/** Captures the Leaflet map instance into a ref so the parent React
 *  tree (outside MapContainer) can call methods like `flyTo()`. */
function CaptureMap({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const { t } = useTranslation();
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}
function EmptyState({ onEnableLocation }: { onEnableLocation: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-cyan-700 shadow-sm">
        <MapPinned size={26} aria-hidden />
      </span>
      <div>
        <h3 className="font-display text-xl font-semibold text-slate-900">
          {t("mapScene.locationIsOff")}
        </h3>
        <p className="mt-1 max-w-md text-sm text-slate-700">
          {t("mapScene.enableLocationToSeeYourPositionO")}
        </p>
      </div>
      <Button onClick={onEnableLocation}>{t("mapScene.enableLocation")}</Button>
    </div>
  );
}
function deriveHeading(analysis: LocationAnalysis): number | null {
  const trail = analysis.breadcrumbTrail;
  if (trail.length < 2) return null;
  const recent = trail.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last) return null;
  const dLat = last.lat - first.lat;
  const dLng = last.lng - first.lng;
  if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) return null;
  const lat1 = (first.lat * Math.PI) / 180;
  const lat2 = (last.lat * Math.PI) / 180;
  const dLon = ((last.lng - first.lng) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}
function describeHeading(degrees: number | null): string {
  if (degrees === null) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(degrees / 45) % 8;
  return `${dirs[idx]} · ${Math.round(degrees)}°`;
}
