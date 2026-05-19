/**
 * Stale dynamic-chunk recovery.
 *
 * Vite emits hashed bundle filenames; after a deploy the SPA already
 * loaded in a tab still references the old hash. When the user
 * lazy-imports a route, the browser hits the new origin for the old
 * filename, gets a 404, and the SPA fallback returns `index.html`
 * with a `text/html` MIME type — which the browser blocks as a JS
 * module. The error then surfaces as "Failed to fetch dynamically
 * imported module".
 *
 * Recovery is in two layers:
 *
 * 1. **`lazyWithRetry`** — wraps `React.lazy()` so the first failure
 *    triggers a self-heal: re-fetch the dynamic import once after
 *    nuking the service worker + Cache Storage. If the retry also
 *    fails, the error propagates (likely a network issue, not a
 *    deploy mismatch).
 *
 * 2. **ErrorBoundary** + global `error` / `unhandledrejection`
 *    listeners — backstop for any chunk failure that slips past the
 *    lazy retry (e.g. dynamic imports that aren't behind lazy()).
 *
 * Both paths converge on `nukeAndReload`, which unregisters the SW,
 * drops every Cache Storage entry, and hard-reloads with a cache-
 * buster query param so the browser also discards its in-memory
 * cache of the stale index.html.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const FLAG = "_chunk_reload";

export function isStaleChunkError(reason: unknown): boolean {
  const message =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
      ? reason.message
      : String((reason as { message?: unknown })?.message ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|chunk[- ]load|Loading chunk \d+ failed/i.test(
    message,
  );
}

let reloading = false;

export async function nukeAndReload(): Promise<void> {
  if (typeof window === "undefined" || reloading) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(FLAG)) return; // already retried — don't loop
  reloading = true;

  // 1. Unregister every service worker so the stale precache stops
  //    intercepting fetches. Wait for unregister to actually settle —
  //    Workbox returns a Promise that resolves *after* the SW has
  //    been removed from the registration list.
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore — best-effort */
  }
  // 2. Drop every cache (precache + runtime caches). New SW
  //    repopulates on next load.
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  // 3. Hard reload to a fresh URL so the browser also discards any
  //    in-memory HTTP cache of the stale index.html / chunks.
  url.searchParams.set(FLAG, String(Date.now()));
  window.location.replace(url.toString());
}

/**
 * `React.lazy()` with auto-recovery for the dynamic-chunk import
 * failure mode. On first failure: nuke + reload. On second failure
 * (after we already attempted reload, indicated by the URL flag), let
 * the error propagate to the ErrorBoundary so the user sees a real
 * error message instead of an invisible reload loop.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      if (!isStaleChunkError(err)) throw err;
      // If we've already burned the one retry, give up so the
      // ErrorBoundary can show a real message rather than spinning.
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get(FLAG)) throw err;
      }
      await nukeAndReload();
      // nukeAndReload triggers a hard reload — this Promise never
      // resolves in the doomed tab. Return a never-resolving Promise
      // so React.lazy keeps its Suspense state until reload kicks in.
      return new Promise<{ default: T }>(() => {});
    }
  });
}

/**
 * Belt-and-suspenders: install global listeners that also fire the
 * recovery if a chunk failure escapes a lazyWithRetry boundary (e.g.
 * raw `import()` calls outside React.lazy).
 */
export function installChunkRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    if (isStaleChunkError(event.error ?? event.message)) {
      void nukeAndReload();
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) {
      void nukeAndReload();
    }
  });
}
