import { useEffect, useMemo, useRef, useState } from "react";

import { MAX_BREADCRUMBS, SIM_MINUTE_FACTOR } from "../constants/app";
import { analyzeLocation, normalizeBreadcrumbs } from "../features/location/lib/location";
import {
  buildLocationScenarios,
  type LocationScenario,
} from "../features/location/lib/scenarios";
import type { AlertInput, LocationPoint, SafeZone, SensorState } from "../types/app";

export function useLocationTracking(initialBreadcrumbs: LocationPoint[], safeZone: SafeZone) {
  const scenarios = useMemo(
    () => buildLocationScenarios(safeZone),
    [safeZone.lat, safeZone.lng, safeZone.radiusM],
  );
  const [breadcrumbs, setBreadcrumbs] = useState(initialBreadcrumbs);
  const [locationScenario, setLocationScenario] = useState<LocationScenario>("home");
  const [geoStatus, setGeoStatus] = useState<SensorState>("simulation");

  const locationIndexRef = useRef(0);
  const virtualClockRef = useRef(Date.now() - 18 * 60 * 1000);
  const geoWatchRef = useRef<number | null>(null);
  const safeZoneSignatureRef = useRef(`${safeZone.lat}:${safeZone.lng}:${safeZone.radiusM}`);

  function seedScenarioTrail(route: Array<Pick<LocationPoint, "lat" | "lng">>) {
    const seededClock = Date.now() - 18 * 60 * 1000;
    virtualClockRef.current = seededClock;
    return route.slice(0, 12).map((point, index) => ({
      ...point,
      timestamp: seededClock - (12 - index) * 45000,
      simulated: true,
    }));
  }

  useEffect(() => {
    if (breadcrumbs.length) return;
    setBreadcrumbs(seedScenarioTrail(scenarios.home));
  }, [breadcrumbs.length, scenarios.home]);

  useEffect(() => {
    locationIndexRef.current = 0;
  }, [locationScenario]);

  useEffect(() => {
    const nextSignature = `${safeZone.lat}:${safeZone.lng}:${safeZone.radiusM}`;
    if (safeZoneSignatureRef.current === nextSignature) return;
    safeZoneSignatureRef.current = nextSignature;
    locationIndexRef.current = 0;

    if (geoStatus !== "simulation") return;
    setBreadcrumbs(seedScenarioTrail(scenarios[locationScenario]));
  }, [geoStatus, locationScenario, safeZone.lat, safeZone.lng, safeZone.radiusM, scenarios, setBreadcrumbs]);

  useEffect(() => {
    if (geoStatus !== "simulation") return undefined;

    const interval = window.setInterval(() => {
      const route = scenarios[locationScenario];
      const nextPoint = route[locationIndexRef.current % route.length];
      locationIndexRef.current += 1;
      virtualClockRef.current += SIM_MINUTE_FACTOR * 1000;

      setBreadcrumbs((previous) =>
        normalizeBreadcrumbs(
          [
            ...previous,
            { ...nextPoint, timestamp: virtualClockRef.current, simulated: true },
          ],
          MAX_BREADCRUMBS,
        ),
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [geoStatus, locationScenario, scenarios]);

  useEffect(
    () => () => {
      if (geoWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
      }
    },
    [],
  );

  async function enableGeolocation(onError?: (alert: AlertInput) => void) {
    if (!navigator.geolocation) {
      onError?.({
        module: "System",
        severity: "warning",
        title: "Geolocation unavailable",
        message: "This browser cannot provide live location. Continuing with simulation.",
        dedupeKey: "geo-unavailable",
      });
      return;
    }

    if (geoWatchRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
    }

    setGeoStatus("requesting");
    geoWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGeoStatus("live");
        setBreadcrumbs((previous) =>
          normalizeBreadcrumbs(
            [
              ...previous,
              {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                timestamp: position.timestamp || Date.now(),
                simulated: false,
              },
            ],
            MAX_BREADCRUMBS,
          ),
        );
      },
      () => {
        setGeoStatus("simulation");
        onError?.({
          module: "System",
          severity: "warning",
          title: "GPS permission denied",
          message: "Live geolocation was rejected. Simulation remains active for demo fidelity.",
          dedupeKey: "geo-denied",
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 10000,
      },
    );
  }

  function disableGeolocation() {
    if (geoWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
    }
    geoWatchRef.current = null;
    setGeoStatus("simulation");
  }

  const locationAnalysis = useMemo(
    () => analyzeLocation(breadcrumbs, safeZone),
    [breadcrumbs, safeZone],
  );

  return {
    breadcrumbs,
    setBreadcrumbs,
    locationScenario,
    setLocationScenario,
    geoStatus,
    locationAnalysis,
    enableGeolocation,
    disableGeolocation,
  };
}
