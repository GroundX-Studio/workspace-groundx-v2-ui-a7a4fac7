import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

// framer-motion is aliased to ./framerMotionMock in vitest.config.ts to keep
// motion.X / AnimatePresence / LayoutGroup / MotionConfig as plain passthroughs
// — the real library's `layout` measurements + `repeat: Infinity` animations
// pin jsdom test workers at 100% CPU.

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
  // EntityRegistry persists to localStorage. Without this isolation
  // hook, a previous test's snapshot could rehydrate into the next
  // test's EntityRegistryProvider and corrupt assertions.
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});
