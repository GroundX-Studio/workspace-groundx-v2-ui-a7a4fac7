/**
 * DBG-01 — reset the experience to "an unauthenticated user seeing
 * onboarding for the first time."
 *
 * This is the SINGLE, EXHAUSTIVE place that clears session/per-visitor
 * state. Forward-binding invariant (locked 2026-05-28, enforced by the
 * `app-architecture` spec): whenever a new app-owned session-scoped
 * storage key, cookie, context cache, or server session record is
 * introduced, it MUST be cleared here AND covered by a reset test in the
 * same change. A reset that misses newly-added state is a regression.
 *
 * Clearing is prefix-based on the app's storage namespaces so that
 * future keys under those namespaces are caught automatically — but a
 * NEW namespace (or a server-side record) still requires updating this
 * file.
 */

import { resetSession } from "@/api/entities/customerEntity";

/**
 * Storage-key prefixes the app owns. Any localStorage/sessionStorage
 * key under one of these is session/visitor state and is cleared on
 * reset. Add a prefix here when a new app storage namespace is created.
 */
export const APP_STORAGE_PREFIXES = ["groundx-onboarding.", "appshell."] as const;

/** Exact app-owned keys that don't fall under a namespaced prefix. */
export const APP_STORAGE_EXACT = ["x-ray-demo-email"] as const;

function isAppOwnedKey(key: string): boolean {
  return (
    APP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    (APP_STORAGE_EXACT as readonly string[]).includes(key)
  );
}

function clearMatching(store: Storage): void {
  // Snapshot keys first — removing during iteration mutates the store's
  // index and skips entries.
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (isAppOwnedKey(key)) store.removeItem(key);
  }
}

/** Clear all app-owned client storage (localStorage + sessionStorage). */
export function clearAppClientStorage(): void {
  if (typeof window === "undefined") return;
  clearMatching(window.localStorage);
  clearMatching(window.sessionStorage);
}

export interface ResetExperienceOptions {
  /** Navigation seam (injectable for tests). Defaults to a hard nav. */
  navigate?: (url: string) => void;
}

/**
 * Full reset: clear client storage → ask the server to clear the
 * httpOnly session + csrf cookies (best-effort) → hard-navigate to F1
 * for a clean remount with fresh contexts + a fresh anon id.
 */
export async function resetExperience(options: ResetExperienceOptions = {}): Promise<void> {
  clearAppClientStorage();
  try {
    // Server clears the httpOnly session cookie (client JS can't) + csrf,
    // and drops the session row, so the next request mints a fresh anon id.
    await resetSession();
  } catch {
    // Best-effort: a reset must still land the user on a fresh F1 even
    // if the network call fails (the client storage is already cleared).
  }
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));
  navigate("/onboarding");
}
