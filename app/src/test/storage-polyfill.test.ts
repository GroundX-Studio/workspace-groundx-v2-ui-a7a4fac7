import { describe, expect, it } from "vitest";

/**
 * Guard: the jsdom test environment must expose a *functional* Web Storage on
 * every supported Node (engines: ">=20").
 *
 * Node 24+ ships a built-in global `localStorage` / `sessionStorage` that — with
 * no `--localstorage-file` — shadows jsdom's with a non-functional stub whose
 * `clear` / `setItem` are undefined. The suite's `beforeEach`
 * `window.localStorage.clear()` then throws on Node 24/25, so the whole suite
 * goes red on current Node while staying green on CI's older Node. The setup's
 * Storage polyfill closes that gap; this guard fails if it regresses.
 */
describe("test Storage is functional on every supported Node", () => {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    it(`${name} supports the full Web Storage contract and round-trips`, () => {
      const storage = window[name];

      expect(typeof storage.setItem).toBe("function");
      expect(typeof storage.getItem).toBe("function");
      expect(typeof storage.removeItem).toBe("function");
      expect(typeof storage.clear).toBe("function");

      storage.setItem("guard-key", "guard-value");
      expect(storage.getItem("guard-key")).toBe("guard-value");

      storage.removeItem("guard-key");
      expect(storage.getItem("guard-key")).toBeNull();

      storage.setItem("a", "1");
      storage.setItem("b", "2");
      storage.clear();
      expect(storage.getItem("a")).toBeNull();
      expect(storage.getItem("b")).toBeNull();
    });
  }
});
