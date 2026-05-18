/**
 * TanStack Query client + localStorage persister.
 *
 * The persister provides write-through caching: every successful query
 * is mirrored into localStorage, so reloads + offline navigations show
 * the last-known data instantly while we re-fetch in the background.
 */

import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";

import { ApiError } from "./client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Always re-fetch on mount; but with persister, the *initial* paint
      // comes from cache so users don't see a spinner.
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7d — persisters need data to outlive gc
      refetchOnWindowFocus: false,
      // Don't retry on auth/permission failures.
      retry: (failureCount, err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "cognitrack.query-cache",
});

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7d
  // Bump this when response shapes change OR when stale per-device data
  // is causing confusion (e.g. demo placeholders showing up on devices
  // whose persister still holds the previous schema).
  buster: "v2-empty-defaults",
});
