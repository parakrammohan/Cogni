import { useCallback, useState } from "react";

import { MAX_ALERTS } from "../constants/app";
import type { AlertInput, AppAlert } from "../types/app";

export function useAlerts() {
  const [alerts, setAlerts] = useState<AppAlert[]>([]);

  const addAlert = useCallback(({ module, severity, title, message, dedupeKey }: AlertInput) => {
    setAlerts((previous) => {
      if (
        dedupeKey &&
        previous.some(
          (alert) => alert.dedupeKey === dedupeKey && Date.now() - alert.createdAt < 20000,
        )
      ) {
        return previous;
      }

      return [
        {
          id: `${Date.now()}-${Math.random()}`,
          createdAt: Date.now(),
          module,
          severity,
          title,
          message,
          dedupeKey,
        },
        ...previous,
      ].slice(0, MAX_ALERTS);
    });
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((previous) => previous.filter((alert) => alert.id !== id));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return { alerts, addAlert, dismissAlert, clearAlerts };
}
