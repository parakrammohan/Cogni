/**
 * Read a user-picked image File and return its base64 `data:` URL.
 * Used by every "Upload photo" affordance — both caregiver Manage and
 * patient People / Memories — so the same value flows into the
 * encrypted-text columns through the backend hooks.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
