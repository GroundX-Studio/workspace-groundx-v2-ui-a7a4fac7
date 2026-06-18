import { describe, expect, it, vi } from "vitest";

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
    it(`${name} exposes the full Web Storage interface, is instanceof Storage, is spyable, and round-trips`, () => {
      const storage = window[name];

      // Full Web Storage method + property surface — not just the subset the
      // app tests happen to call.
      expect(typeof storage.setItem).toBe("function");
      expect(typeof storage.getItem).toBe("function");
      expect(typeof storage.removeItem).toBe("function");
      expect(typeof storage.clear).toBe("function");
      expect(typeof storage.key).toBe("function");

      storage.clear();
      expect(storage.length).toBe(0);

      // round-trip
      storage.setItem("guard-key", "guard-value");
      expect(storage.getItem("guard-key")).toBe("guard-value");
      expect(storage.length).toBe(1);

      // length + key() track contents
      storage.setItem("a", "1");
      storage.setItem("b", "2");
      expect(storage.length).toBe(3);
      const keys = [storage.key(0), storage.key(1), storage.key(2)];
      expect(keys).toContain("guard-key");
      expect(keys).toContain("a");
      expect(keys).toContain("b");
      expect(storage.key(99)).toBeNull();

      storage.removeItem("guard-key");
      expect(storage.getItem("guard-key")).toBeNull();
      expect(storage.length).toBe(2);

      storage.clear();
      expect(storage.length).toBe(0);
      expect(storage.getItem("a")).toBeNull();
      expect(storage.getItem("b")).toBeNull();

      // The stand-in must be a genuine Storage and its methods must be spyable
      // — ChatStore's QuotaExceededError test spies setItem on the prototype.
      expect(storage).toBeInstanceOf(Storage);
      const spy = vi.spyOn(Object.getPrototypeOf(storage) as Storage, "setItem");
      storage.setItem("spy-probe", "x");
      expect(spy).toHaveBeenCalledWith("spy-probe", "x");
      spy.mockRestore();
      storage.clear();
    });
  }
});
