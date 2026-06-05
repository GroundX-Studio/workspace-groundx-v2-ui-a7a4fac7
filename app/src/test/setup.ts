import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

// framer-motion is aliased to ./framerMotionMock in vitest.config.ts to keep
// motion.X / AnimatePresence / LayoutGroup / MotionConfig as plain passthroughs
// — the real library's `layout` measurements + `repeat: Infinity` animations
// pin jsdom test workers at 100% CPU.

// Node 24+ ships a built-in global localStorage / sessionStorage (Web Storage)
// that, with no `--localstorage-file`, shadows jsdom's working Storage with a
// stub whose `clear` / `setItem` are undefined — so the `beforeEach`
// `localStorage.clear()` below throws and the whole suite goes red on Node 24/25,
// even though engines is ">=20". (CI's older Node has no such global, so jsdom's
// Storage wins and the code below is a no-op there.)
//
// Install an in-memory Storage when the active one is non-functional. Caveat:
// this cannot satisfy jsdom's StorageEvent `storageArea` webidl check, which
// demands a *genuine* jsdom Storage — so on Node 24/25 the one ChatStore
// cross-tab-StorageEvent test stays red (needs the CI Node, or a jsdom upgrade).
// Every other test passes.
const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  // Methods live on an intermediate prototype chained to Storage.prototype and
  // are configurable + writable, so `localStorage.__proto__.setItem` is spyable
  // (ChatStore's QuotaExceededError test) and the value is `instanceof Storage`.
  const base = typeof globalThis.Storage === "function" ? globalThis.Storage.prototype : Object.prototype;
  const proto = Object.create(base) as object;
  const method = (value: unknown) => ({ value, writable: true, configurable: true });
  Object.defineProperties(proto, {
    length: { get: () => store.size, configurable: true },
    clear: method(() => store.clear()),
    getItem: method((key: string) => (store.has(key) ? store.get(key)! : null)),
    key: method((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: method((key: string) => void store.delete(key)),
    setItem: method((key: string, value: string) => void store.set(String(key), String(value))),
  });
  return Object.create(proto) as Storage;
};

const safeRead = (name: "localStorage" | "sessionStorage"): unknown => {
  try {
    return window[name];
  } catch {
    return undefined;
  }
};

const isFunctionalStorage = (value: unknown): value is Storage => {
  try {
    const storage = value as Storage | null | undefined;
    return !!storage && typeof storage.clear === "function" && typeof storage.setItem === "function";
  } catch {
    return false;
  }
};

const ensureFunctionalStorage = (name: "localStorage" | "sessionStorage") => {
  if (isFunctionalStorage(safeRead(name))) return;
  const descriptor = { value: createMemoryStorage(), writable: true, configurable: true };
  Object.defineProperty(window, name, descriptor);
  Object.defineProperty(globalThis, name, descriptor);
};

if (typeof window !== "undefined") {
  ensureFunctionalStorage("localStorage");
  ensureFunctionalStorage("sessionStorage");
}

let consoleErrorSpy: { mockRestore: () => void };

// jsdom doesn't ship matchMedia. Stub it once, defaulting prefers-reduced-motion
// to "reduce" so Framer Motion / MUI media-driven hooks skip animations during
// tests — otherwise looping `repeat: Infinity` animations keep firing requestAnimationFrame
// after teardown and pin the test worker at 100% CPU.
beforeAll(() => {
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion") || query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    throw new Error(`Unexpected console.error during test: ${args.map(String).join(" ")}`);
  });
  // EntitySessionStore persists to localStorage. Without this isolation
  // hook, a previous test's snapshot could rehydrate into the next
  // test's EntitySessionStoreProvider and corrupt assertions.
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});
