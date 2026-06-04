import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Web Storage polyfill for the jsdom test environment.
//
// Node 24+ ships a built-in global `localStorage` / `sessionStorage` (Web
// Storage API). Without a backing store configured (`--localstorage-file`),
// that global resolves to an object whose `getItem` / `setItem` / `clear`
// methods are absent, and because it is defined on `globalThis` it shadows the
// Storage that jsdom installs on its window. Production code (api/axios.ts,
// views/Auth/Register.tsx) and several tests use these APIs, so on Node 24/25
// the suite fails with "localStorage.setItem is not a function".
//
// CI runs on Node 22, where the global does not exist and jsdom's Storage wins,
// so this only bites locally on newer Node. Installing a real in-memory Storage
// here makes the suite deterministic on every supported Node version. The
// global descriptor is `configurable: true`, so we can override it.
// ---------------------------------------------------------------------------

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  } as Storage;
};

const localStorageMock = createMemoryStorage();
const sessionStorageMock = createMemoryStorage();

const installStorage = (name: "localStorage" | "sessionStorage", storage: Storage) => {
  Object.defineProperty(globalThis, name, { value: storage, writable: true, configurable: true });
  if (typeof window !== "undefined" && (window as unknown) !== (globalThis as unknown)) {
    Object.defineProperty(window, name, { value: storage, writable: true, configurable: true });
  }
};

installStorage("localStorage", localStorageMock);
installStorage("sessionStorage", sessionStorageMock);

let consoleErrorSpy: { mockRestore: () => void };

beforeEach(() => {
  // Isolate Web Storage between tests so leakage can't cross test boundaries.
  localStorageMock.clear();
  sessionStorageMock.clear();

  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    throw new Error(`Unexpected console.error during test: ${args.map(String).join(" ")}`);
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});
