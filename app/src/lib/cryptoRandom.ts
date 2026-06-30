/**
 * A unique-enough random id string.
 *
 * `crypto.randomUUID()` is widely available but NOT universal: it is absent in some
 * jsdom test environments and is only defined in a SECURE browser context (https:// or
 * localhost) — a non-secure `http://` page or an embedded webview can lack it, where a
 * bare `crypto.randomUUID()` throws `TypeError`. This is the single source for every
 * client-minted id (chat turn ids, the streaming `turnKey`, Extract template ids), so
 * the jsdom/secure-context fallback lives in exactly one place.
 */
export function cryptoRandom(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
