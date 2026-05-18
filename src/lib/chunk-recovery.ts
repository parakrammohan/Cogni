/**
 * Stale dynamic-chunk recovery.
 *
 * Vite emits hashed bundle file names; after a deploy the SPA that's
 * already loaded in a tab still references the old hash. When the
 * user lazy-imports a route, the browser hits the new origin for the
 * old filename, gets a 404, and React throws "Failed to fetch
 * dynamically imported module".
 *
 * Recovery: catch the global event, do a one-shot full reload so the
 * tab picks up the new bundle. The `?_chunk_reload=…` flag stops us
 * from looping if the reload itself somehow fails the same way.
 */

const FLAG = "_chunk_reload";

function isStaleChunkError(reason: unknown): boolean {
  const message =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
      ? reason.message
      : String((reason as { message?: unknown })?.message ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

function reloadOnce(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(FLAG)) return; // already retried — don't loop
  url.searchParams.set(FLAG, String(Date.now()));
  window.location.replace(url.toString());
}

export function installChunkRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    if (isStaleChunkError(event.error ?? event.message)) reloadOnce();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) reloadOnce();
  });
}
