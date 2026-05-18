/**
 * Stale dynamic-chunk recovery.
 *
 * Vite emits hashed bundle file names; after a deploy the SPA that's
 * already loaded in a tab still references the old hash. When the
 * user lazy-imports a route, the browser hits the new origin for the
 * old filename, gets a 404, and React throws "Failed to fetch
 * dynamically imported module".
 *
 * Recovery: catch the global event, unregister the service worker AND
 * drop every Cache Storage entry, then do a one-shot reload so the
 * tab definitely picks up the new bundle. The earlier "soft reload"
 * version wasn't enough because the SW was still serving the stale
 * index.html out of its precache.
 */

const FLAG = "_chunk_reload";

function isStaleChunkError(reason: unknown): boolean {
  const message =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
      ? reason.message
      : String((reason as { message?: unknown })?.message ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|chunk[- ]load/i.test(
    message,
  );
}

let reloading = false;

async function nukeAndReload(): Promise<void> {
  if (typeof window === "undefined" || reloading) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(FLAG)) return; // already retried — don't loop
  reloading = true;

  // 1. Unregister every service worker so the stale precache stops
  //    intercepting fetches.
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore — best-effort */
  }
  // 2. Drop every cache (precache + runtime caches). The new SW will
  //    repopulate on next load.
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
