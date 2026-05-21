# Location pipeline

Geofencing, pacing detection, and dwelling detection live in `src/features/location/lib/`. This is the layer that decides whether the patient is safe, wandering, pacing in a corridor, or stuck in one spot outside the safe zone.

## Coordinate transforms

We use a **flat-earth approximation** for short distances around the safe-zone center. It's accurate to ~0.5 % within a few kilometers, which is plenty for a per-house demo.

- `haversineMeters(a, b)` → great-circle distance in meters between two lat/lng points (used for the geofence test).
- `toLocalMeters(point, origin)` → converts lat/lng to local (x = east, y = north) meters relative to `origin`.
- `offsetCoord(base, eastM, northM)` → inverse: builds a lat/lng given an offset from `base`.

The trail is stored in lat/lng, but anomaly detection runs in local meters (so we can do plain Euclidean math without trigonometry).

## Live vs simulated

`useLocationTracking({ initialBreadcrumbs, safeZone, simulate })` returns:

```ts
{ breadcrumbs, locationScenario, setLocationScenario, geoStatus, locationAnalysis, … }
```

Three states for `geoStatus`:

- **`"live"`**: `navigator.geolocation.watchPosition` is active and pushing `{lat, lng, timestamp, simulated: false}` into `breadcrumbs`.
- **`"simulation"`**: we step through one of three pre-baked routes (`home`, `pacing`, `dwelling`) every 1 second and push a `{simulated: true}` point.
- **`"offline"`**: nothing happens. No data flows; panels show "Enable" CTAs.

The default is `"offline"`. Simulations are off by default — they only run when the operator flips **Enable simulations** on in the **Parameters** modal (bottom-right floating button). Inside Parameters, the **Location route** picker controls which scenario plays.

If the user grants live permission and it succeeds → `"live"`. If denied, we drop to `"simulation"` (when sims are enabled) or `"offline"` (when they're not).

## Geofence

The simplest detector: distance from the safe-zone center > radius?

```
analysis.outOfBounds = haversineMeters(latest, safeZone) > safeZone.radiusM
```

Default safe zone is in central Singapore (`{lat: 1.3521, lng: 103.8198, radiusM: 120}`); the caregiver can drag the marker on the map and adjust the radius via the slider.

When `outOfBounds` flips from false to true, `useAlertOrchestration` emits a **danger** alert: *"Out-of-bounds excursion"*.

## Pacing detection

Pacing = back-and-forth motion along a confined corridor. Common in Alzheimer's wandering. The classifier (`detectPacing` in `features/location/lib/location.ts`):

1. Take the last 5 minutes of breadcrumbs (`PACING_WINDOW_MS = 5 * 60 * 1000`).
2. Project them all into local meters relative to the safe zone.
3. Find the **longest pair** of points (anchor A, anchor B) — this is the corridor's main axis.
4. Reject early if the corridor is too short (`< 24 m`) or too long (`> 90 m`) — outside that range it's not corridor-like motion.
5. Project all points onto the axis (along) and the perpendicular (across).
6. Threshold of "side switching" is `max(6, span * 0.16)` meters from the corridor midpoint. Count how many times the axis-along projection crosses the midpoint with a meaningful side change.
7. Active iff `span >= 28 m && width <= 18 m && crossings >= 4`.

Outputs: `{active, crossings, span, width}`.

We don't currently fire an alert on `pacing.active` — it's surfaced to the caregiver dashboard but considered weaker evidence than dwelling or geofence breach. That choice is documented here so it's an easy add later.

## Dwelling detection

Dwelling = patient hasn't moved in a long time, while outside the safe zone. The classifier (`detectDwelling`):

1. Take the last 15 minutes of breadcrumbs (`DWELLING_WINDOW_MS = 15 * 60 * 1000`).
2. Compute the bounding-box width and height (in local meters).
3. Diagonal = `sqrt(width² + height²)`.
4. Active iff `currentDistance > safeZoneRadius && duration >= 15 min && diagonal < 10 m`.

That last condition — diagonal < 10 m — is what makes it "stuck"; a patient sitting on a bench has a tiny bounding box, while one walking around has a much larger one.

Outputs: `{active, diagonal, duration, width, height}`.

When `active` flips true, an alert fires: *"Dwelling / lost anomaly"*.

## What `analyzeLocation` returns

```ts
interface LocationAnalysis {
  latest: LocationPoint | null;     // most recent breadcrumb
  currentDistance: number;          // meters from safeZone center
  outOfBounds: boolean;             // currentDistance > radiusM
  pacing: PacingAnalysis;           // {active, crossings, span, width}
  dwelling: DwellingAnalysis;       // {active, diagonal, duration, width, height}
  localTrail: LocalPoint[];         // breadcrumbs in local meters
  breadcrumbTrail: LocationPoint[]; // raw lat/lng + timestamp
}
```

The result is memoized on `[breadcrumbs, safeZone]` inside `useLocationTracking` so the O(n²) pacing search doesn't run on every render.

## Persistence

Only **non-simulated** breadcrumbs are written to `localStorage`. The patient view's `useEffect` filters out `simulated: true` points before saving. This keeps demo runs from accidentally turning into "real history" between sessions.

## Map UI

`MapPanel.tsx` renders a Leaflet map with:

- OpenStreetMap tile layer (free, attribution shown). Production deployment would benefit from swapping to OneMap for Singapore-context tiles — listed as a follow-up.
- A draggable marker for the safe-zone center (drag to move; the original click-to-move was a UX trap and was removed).
- A `Circle` showing the safe-zone radius.
- A polyline + circle markers for the breadcrumb trail; the latest point is highlighted in coral.
- A dashed circle visualizing the dwelling bounding box if `dwelling.active`.
- A `Slider` (Radix) for radius adjustment with 44 px touch targets.

Caregiver-side `GeofencePanel.tsx` supports two zone-creation modes:

- **Polygon** — tap to add vertices, "Finish (N)" commits. N must be ≥ 3.
- **Circle** — touch-friendly alternative for mobile. Tap once to place the centre; a radius slider in the toolbar resizes the preview live (25 m to 500 m). Tap Finish to commit. At commit time the circle is approximated as a 32-vertex polygon so the existing `pointInPolygon` code path is unchanged and the schema stays polygon-only.

The map container uses CSS `isolate` so Leaflet's internal z-index 700-1000 widgets stay below the mobile BottomNav (`z-[1050]`) — without `isolate`, Leaflet's controls would bleed over the nav on mobile.

## Limitations

- Pacing detection is O(n²) anchor search. With max 80 breadcrumbs (`MAX_BREADCRUMBS`), it's ~6400 ops per analysis — fine for the demo. Larger windows would need a convex-hull diameter approach.
- The flat-earth approximation breaks down beyond ~10 km from the origin. Not relevant for in-home tracking.
- Real GPS accuracy is ~10–30 m; the safe-zone radius should not be set below ~40 m or live mode will see false breaches. The slider's minimum is 40 m for that reason.
