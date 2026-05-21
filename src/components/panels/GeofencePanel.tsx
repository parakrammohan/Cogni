import L, { divIcon, type LeafletMouseEvent } from "leaflet";
import {
  AlertTriangle,
  Check,
  Circle as CircleIcon,
  Crosshair,
  MapPinned,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvent,
} from "react-leaflet";
import Badge from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../../lib/utils";
import {
  type GeofenceSettings,
  type GeoZone,
  type ZoneAlertMode,
  newZoneId,
  pointInPolygon,
} from "../../features/location/lib/geofence";
import type { LocationAnalysis } from "../../types/app";
import { useTranslation } from "react-i18next";
interface GeofencePanelProps {
  analysis: LocationAnalysis;
  settings: GeofenceSettings;
  onSettingsChange: (next: GeofenceSettings) => void;
  /** Latest wandering detector verdict — used to colour the badge. */
  wanderingActive: boolean;
  scenarioLabel: string;
}
type Mode =
  | {
      kind: "browse";
    }
  | {
      kind: "drawing";
      vertices: Array<{
        lat: number;
        lng: number;
      }>;
    }
  | {
      kind: "circle";
      center: {
        lat: number;
        lng: number;
      } | null;
      radiusMeters: number;
    };
const DEFAULT_CIRCLE_RADIUS_M = 100;
const CIRCLE_POLYGON_VERTICES = 32;

/** Approximate a circle as an N-vertex polygon since the geofence
 *  schema only knows polygons. Uses an equirectangular projection
 *  good enough at city-sized radii (<5 km). */
function circleToPolygon(
  center: {
    lat: number;
    lng: number;
  },
  radiusMeters: number,
  vertices = CIRCLE_POLYGON_VERTICES,
): Array<{
  lat: number;
  lng: number;
}> {
  const earthRadiusM = 6_378_137;
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = (radiusMeters / earthRadiusM) * (180 / Math.PI);
  const dLng = ((radiusMeters / earthRadiusM) * (180 / Math.PI)) / Math.max(Math.cos(latRad), 1e-6);
  const out: Array<{
    lat: number;
    lng: number;
  }> = [];
  for (let i = 0; i < vertices; i++) {
    const theta = (i / vertices) * 2 * Math.PI;
    out.push({
      lat: center.lat + dLat * Math.cos(theta),
      lng: center.lng + dLng * Math.sin(theta),
    });
  }
  return out;
}

// Slightly different palette per zone so multiple zones on the same map
// stay visually distinct.
const ZONE_COLOURS = ["#0e7490", "#a855f7", "#f97316", "#10b981", "#e11d48", "#0ea5e9"];
function zoneColour(idx: number): string {
  return ZONE_COLOURS[idx % ZONE_COLOURS.length]!;
}
const patientMarker = divIcon({
  className: "patient-marker",
  html: '<span class="patient-marker__halo"></span><span class="patient-marker__arrow" style="transform: translate(-50%, -50%)"></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
export default function GeofencePanel({
  analysis,
  settings,
  onSettingsChange,
  wanderingActive,
  scenarioLabel,
}: GeofencePanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>({
    kind: "browse",
  });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const center = analysis.latest
    ? ([analysis.latest.lat, analysis.latest.lng] as [number, number])
    : settings.zones[0]?.polygon[0]
      ? ([settings.zones[0]!.polygon[0]!.lat, settings.zones[0]!.polygon[0]!.lng] as [
          number,
          number,
        ])
      : ([1.3521, 103.8198] as [number, number]); // Singapore default

  // Whether the patient is currently outside ALL zones (i.e. would trip
  // any "exit" alert). Used for the global status badge.
  const insideAnyZone = useMemo(() => {
    const p = analysis.latest;
    if (!p) return true;
    return settings.zones.some((z) => pointInPolygon(p, z.polygon));
  }, [analysis.latest, settings.zones]);
  const startDraw = () =>
    setMode({
      kind: "drawing",
      vertices: [],
    });
  const startCircle = () =>
    setMode({
      kind: "circle",
      center: null,
      radiusMeters: DEFAULT_CIRCLE_RADIUS_M,
    });
  const cancelDraw = () =>
    setMode({
      kind: "browse",
    });
  const finishDraw = () => {
    if (mode.kind === "drawing" && mode.vertices.length >= 3) {
      const newZone: GeoZone = {
        id: newZoneId(),
        name: `Zone ${settings.zones.length + 1}`,
        polygon: mode.vertices,
        alertModes: ["exit"],
        createdAt: Date.now(),
      };
      onSettingsChange({
        ...settings,
        zones: [...settings.zones, newZone],
      });
      setMode({
        kind: "browse",
      });
      return;
    }
    if (mode.kind === "circle" && mode.center) {
      const polygon = circleToPolygon(mode.center, mode.radiusMeters);
      const newZone: GeoZone = {
        id: newZoneId(),
        name: `Zone ${settings.zones.length + 1}`,
        polygon,
        alertModes: ["exit"],
        createdAt: Date.now(),
      };
      onSettingsChange({
        ...settings,
        zones: [...settings.zones, newZone],
      });
      setMode({
        kind: "browse",
      });
    }
  };
  const removeZone = (id: string) =>
    onSettingsChange({
      ...settings,
      zones: settings.zones.filter((z) => z.id !== id),
    });
  const renameZone = (id: string, name: string) =>
    onSettingsChange({
      ...settings,
      zones: settings.zones.map((z) =>
        z.id === id
          ? {
              ...z,
              name,
            }
          : z,
      ),
    });
  const toggleMode = (id: string, m: ZoneAlertMode) =>
    onSettingsChange({
      ...settings,
      zones: settings.zones.map((z) =>
        z.id === id
          ? {
              ...z,
              alertModes: z.alertModes.includes(m)
                ? z.alertModes.filter((x) => x !== m)
                : [...z.alertModes, m],
            }
          : z,
      ),
    });
  const toggleWandering = () =>
    onSettingsChange({
      ...settings,
      wanderingEnabled: !settings.wanderingEnabled,
    });
  const mapRef = useRef<L.Map | null>(null);
  const recenter = useCallback(() => {
    const map = mapRef.current;
    const target = analysis.latest ?? {
      lat: center[0],
      lng: center[1],
    };
    if (!map) return;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), {
      animate: true,
      duration: 0.5,
    });
  }, [analysis.latest?.lat, analysis.latest?.lng, center]);
  return (
    <div className="grid h-full min-h-0 flex-1 grid-rows-[1fr_auto] gap-3 lg:grid-cols-[1.4fr_minmax(280px,1fr)] lg:grid-rows-1">
      {/* Map — `isolate` keeps Leaflet's internal z-indexes from
          escaping into the page stacking context (BottomNav is
          z-[1050] and should always sit on top). */}
      <div className="relative isolate overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-(--shadow-soft)">
        <MapContainer
          center={center}
          zoom={16}
          scrollWheelZoom
          className="absolute inset-0 h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitMap center={center} />
          <CaptureMap mapRef={mapRef} />
          <DrawingLayer mode={mode} setMode={setMode} />

          {/* Existing zones */}
          {settings.zones.map((zone, idx) => (
            <Polygon
              key={zone.id}
              positions={zone.polygon.map((p) => [p.lat, p.lng])}
              pathOptions={{
                color: zoneColour(idx),
                fillColor: zoneColour(idx),
                fillOpacity: 0.12,
                weight: 2,
              }}
            >
              <Tooltip direction="top" sticky>
                {zone.name}
              </Tooltip>
            </Polygon>
          ))}

          {/* Patient trail */}
          {analysis.breadcrumbTrail.length > 1 ? (
            <Polyline
              positions={analysis.breadcrumbTrail.map((p) => [p.lat, p.lng])}
              pathOptions={{
                color: "#0f172a",
                weight: 3,
                opacity: 0.55,
              }}
            />
          ) : null}
          {analysis.latest ? (
            <Marker
              icon={patientMarker}
              position={[analysis.latest.lat, analysis.latest.lng]}
              interactive={false}
            />
          ) : null}
        </MapContainer>

        {/* Top toolbar. Pushed right of Leaflet's built-in zoom +/-
            widget (top-left, ~52px wide) so it doesn't overlap, and
            z-[1001] above the zoom layer (z-index 1000) for clicks. */}
        <div className="pointer-events-none absolute left-16 right-3 top-3 z-[1001] flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto inline-flex flex-wrap items-center gap-2">
            {mode.kind === "browse" ? (
              <>
                <Button onClick={startDraw} icon={<Plus size={14} />} size="sm">
                  {t("geofencePanel.addPolygon")}
                </Button>
                <Button
                  onClick={startCircle}
                  variant="secondary"
                  icon={<CircleIcon size={14} />}
                  size="sm"
                >
                  {t("geofencePanel.addCircle")}
                </Button>
              </>
            ) : mode.kind === "drawing" ? (
              <>
                <Button
                  onClick={finishDraw}
                  disabled={mode.vertices.length < 3}
                  icon={<Check size={14} />}
                  size="sm"
                >
                  {t("geofencePanel.finish")}
                  {mode.vertices.length})
                </Button>
                <Button onClick={cancelDraw} variant="secondary" icon={<X size={14} />} size="sm">
                  {t("geofencePanel.cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={finishDraw}
                  disabled={!mode.center}
                  icon={<Check size={14} />}
                  size="sm"
                >
                  {t("geofencePanel.finish2")}
                </Button>
                <Button onClick={cancelDraw} variant="secondary" icon={<X size={14} />} size="sm">
                  {t("geofencePanel.cancel")}
                </Button>
                {mode.center ? (
                  <label className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
                    {t("geofencePanel.radius")}
                    <input
                      type="range"
                      min={25}
                      max={500}
                      step={5}
                      value={mode.radiusMeters}
                      onChange={(e) =>
                        setMode({
                          ...mode,
                          radiusMeters: Number(e.target.value),
                        })
                      }
                      className="h-3 w-32 accent-cyan-600"
                    />
                    <span className="font-mono tabular-nums text-slate-900">
                      {mode.radiusMeters} m
                    </span>
                  </label>
                ) : null}
              </>
            )}
            <span className="hidden rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600 shadow-sm backdrop-blur sm:inline-block">
              {mode.kind === "drawing"
                ? "Tap the map to add vertices. Tap Finish when you're done."
                : mode.kind === "circle"
                  ? mode.center
                    ? "Drag the radius slider; tap the map to reposition."
                    : "Tap the map to place the centre."
                  : "Add a polygon or circle to define a safe region."}
            </span>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <Badge tone={insideAnyZone ? "good" : "danger"}>
              {insideAnyZone ? "Inside a zone" : "Outside all zones"}
            </Badge>
            <Badge tone={wanderingActive ? "warning" : "info"}>
              {wanderingActive ? "Wandering" : scenarioLabel}
            </Badge>
          </div>
        </div>

        {/* Center-on-patient button — bottom-right of the map area.
            z-[1001] sits over Leaflet's z-1000 zoom widget. */}
        <button
          type="button"
          onClick={recenter}
          aria-label={t("geofencePanel.centerOnPatient")}
          title={t("geofencePanel.centerOnPatient")}
          className="pointer-events-auto absolute bottom-3 right-3 z-[1001] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-cyan-50 hover:text-cyan-700 hover:ring-cyan-300 active:scale-95"
        >
          <Crosshair size={18} aria-hidden />
        </button>
      </div>

      {/* Right sidebar — zone list + wandering toggle */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("geofencePanel.wanderingAlerts")}
            </div>
            <p className="mt-0.5 text-xs leading-4 text-slate-500">
              {t("geofencePanel.firesWhenMeanderingMotionIsDetec")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.wanderingEnabled}
            onClick={toggleWandering}
            className={cx(
              "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition",
              settings.wanderingEnabled ? "bg-cyan-500" : "bg-slate-300",
            )}
          >
            <span
              className={cx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition",
                settings.wanderingEnabled ? "translate-x-5" : "translate-x-1",
              )}
            />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-(--shadow-soft)">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("geofencePanel.zones")} {settings.zones.length}
            </div>
            {settings.zones.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    zones: [],
                  })
                }
                className="text-xs font-semibold text-rose-600 hover:text-rose-700"
              >
                {t("geofencePanel.clearAll")}
              </button>
            ) : null}
          </div>
          {settings.zones.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
              <MapPinned size={20} aria-hidden />
              {t("geofencePanel.noZonesYetTap")} <strong>{t("geofencePanel.addZone")}</strong>{" "}
              {t("geofencePanel.inTheMapToolbarToDrawYourFirstRe")}
            </div>
          ) : (
            <ul className="space-y-2">
              {settings.zones.map((zone, idx) => (
                <ZoneRow
                  key={zone.id}
                  zone={zone}
                  index={idx}
                  renaming={renamingId === zone.id}
                  onStartRename={() => setRenamingId(zone.id)}
                  onCommitName={(name) => {
                    renameZone(zone.id, name);
                    setRenamingId(null);
                  }}
                  onCancelRename={() => setRenamingId(null)}
                  onToggleMode={(m) => toggleMode(zone.id, m)}
                  onDelete={() => removeZone(zone.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
function ZoneRow({
  zone,
  index,
  renaming,
  onStartRename,
  onCommitName,
  onCancelRename,
  onToggleMode,
  onDelete,
}: {
  zone: GeoZone;
  index: number;
  renaming: boolean;
  onStartRename: () => void;
  onCommitName: (name: string) => void;
  onCancelRename: () => void;
  onToggleMode: (m: ZoneAlertMode) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(zone.name);
  useEffect(() => {
    setDraft(zone.name);
  }, [zone.name, renaming]);
  const colour = zoneColour(index);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{
            backgroundColor: colour,
          }}
          aria-hidden
        />
        {renaming ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitName(draft.trim() || zone.name);
              if (e.key === "Escape") onCancelRename();
            }}
            onBlur={() => onCommitName(draft.trim() || zone.name)}
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-cyan-500 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onStartRename}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-900 hover:text-cyan-700"
            title={t("geofencePanel.renameZone")}
          >
            {zone.name}
          </button>
        )}
        <button
          type="button"
          onClick={onStartRename}
          className="text-slate-400 transition hover:text-slate-600"
          aria-label={t("geofencePanel.rename")}
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-rose-400 transition hover:text-rose-600"
          aria-label={t("geofencePanel.deleteZone")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("geofencePanel.alerts")}
        </span>
        <ModePill
          active={zone.alertModes.includes("exit")}
          label={t("geofencePanel.exit")}
          icon={<AlertTriangle size={10} />}
          onClick={() => onToggleMode("exit")}
        />
        <ModePill
          active={zone.alertModes.includes("dwelling")}
          label={t("geofencePanel.dwelling")}
          icon={<MapPinned size={10} />}
          onClick={() => onToggleMode("dwelling")}
        />
      </div>
    </li>
  );
}
function ModePill({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition",
        active
          ? "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200"
          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Pan to a new centre when it changes (e.g. when the patient location updates). */
function FitMap({ center }: { center: [number, number] }) {
  const { t } = useTranslation();
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 || center[1] !== 0) {
      map.panTo(center, {
        animate: true,
        duration: 0.45,
      });
    }
  }, [center, map]);
  return null;
}

/** Captures the Leaflet map instance into a ref so the parent React
 *  tree (outside MapContainer) can call `flyTo()` etc. */
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

/** Renders the in-progress polygon while the caregiver is drawing it,
 *  binds the map click handler that adds vertices (polygon mode) or
 *  sets/repositions the centre (circle mode). Each polygon vertex is
 *  a clickable circle marker for removal before finishing. */
function DrawingLayer({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { t } = useTranslation();
  useMapEvent("click", (e: LeafletMouseEvent) => {
    if (mode.kind === "drawing") {
      setMode({
        kind: "drawing",
        vertices: [
          ...mode.vertices,
          {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
          },
        ],
      });
      return;
    }
    if (mode.kind === "circle") {
      // First tap sets the centre. Subsequent taps reposition it —
      // the radius slider in the toolbar handles size, so we don't
      // need a second tap-to-set-radius which is fiddly on touch.
      setMode({
        ...mode,
        center: {
          lat: e.latlng.lat,
          lng: e.latlng.lng,
        },
      });
    }
  });

  // Add the "drawing" cursor while drawing so the user knows the map clicks
  // are being captured.
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = mode.kind === "drawing" || mode.kind === "circle" ? "crosshair" : "";
    return () => {
      container.style.cursor = "";
    };
  }, [map, mode.kind]);
  if (mode.kind === "circle") {
    if (!mode.center) return null;
    return (
      <Circle
        center={[mode.center.lat, mode.center.lng]}
        radius={mode.radiusMeters}
        pathOptions={{
          color: "#0ea5e9",
          fillColor: "#0ea5e9",
          fillOpacity: 0.18,
          weight: 2,
        }}
      />
    );
  }
  if (mode.kind !== "drawing" || mode.vertices.length === 0) return null;
  const verts = mode.vertices;
  const polyline: [number, number][] = verts.map((v) => [v.lat, v.lng]);
  // Close back to the first vertex with a dashed preview so the caregiver
  // sees what shape they'd commit if they tap Finish now.
  const previewClose: [number, number][] =
    verts.length >= 2 ? [polyline[polyline.length - 1]!, polyline[0]!] : [];
  return (
    <>
      <Polyline
        positions={polyline}
        pathOptions={{
          color: "#0ea5e9",
          weight: 3,
        }}
      />
      {previewClose.length > 0 ? (
        <Polyline
          positions={previewClose}
          pathOptions={{
            color: "#0ea5e9",
            weight: 2,
            dashArray: "6 6",
            opacity: 0.6,
          }}
        />
      ) : null}
      {verts.map((v, i) => (
        <CircleMarker
          key={i}
          center={[v.lat, v.lng]}
          radius={6}
          pathOptions={{
            color: "#0ea5e9",
            fillColor: i === 0 ? "#0ea5e9" : "#ffffff",
            fillOpacity: 1,
            weight: 2,
          }}
          eventHandlers={{
            click: (event) => {
              // Remove this vertex on click.
              L.DomEvent.stopPropagation(event);
              setMode({
                kind: "drawing",
                vertices: verts.filter((_, idx) => idx !== i),
              });
            },
          }}
        >
          <Tooltip direction="top">{i === 0 ? "Start" : "Tap to remove"}</Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
