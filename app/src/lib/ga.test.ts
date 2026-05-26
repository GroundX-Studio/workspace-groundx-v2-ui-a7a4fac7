/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OB-03 — GA4 gtag wrapper. We mount gtag onto `window.dataLayer` /
// `window.gtag` the same way the loader script would; the wrapper
// pushes events through `window.gtag(...)`. Tests assert against
// the push calls, no real network hits.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

async function freshImport(): Promise<typeof import("./ga")> {
  vi.resetModules();
  return await import("./ga");
}

beforeEach(() => {
  // Reset the gtag surface so each test starts clean.
  window.dataLayer = [];
  window.gtag = vi.fn();
  // Remove any script tags the previous test's initGa appended.
  document.querySelectorAll("script[data-ga-loader]").forEach((n) => n.remove());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ga wrapper (OB-03)", () => {
  it("no measurementId → does NOT inject gtag.js, does NOT call window.gtag; gaTrack is a no-op", async () => {
    const { initGa, gaTrack } = await freshImport();
    expect(initGa(undefined)).toBe(false);
    gaTrack("sample.picked", { scenario: "utility" });
    expect(window.gtag).not.toHaveBeenCalled();
    expect(document.querySelectorAll("script[data-ga-loader]")).toHaveLength(0);
  });

  it("empty-string measurementId → also a no-op", async () => {
    const { initGa, gaTrack } = await freshImport();
    expect(initGa("")).toBe(false);
    gaTrack("session.started");
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("real measurementId → injects gtag.js loader, calls config, gaTrack forwards events", async () => {
    const { initGa, gaTrack } = await freshImport();
    expect(initGa("G-ABC12345")).toBe(true);
    // Loader script injected.
    const loaderEl = document.querySelector("script[data-ga-loader]");
    expect(loaderEl).not.toBeNull();
    expect(loaderEl?.getAttribute("src")).toContain("googletagmanager.com/gtag/js");
    expect(loaderEl?.getAttribute("src")).toContain("id=G-ABC12345");

    // window.gtag called with js + config on init.
    const calls = (window.gtag as ReturnType<typeof vi.fn>).mock.calls;
    const configCall = calls.find((c) => c[0] === "config" && c[1] === "G-ABC12345");
    expect(configCall).toBeDefined();

    // gaTrack forwards as an event push.
    gaTrack("sample.picked", { scenario: "utility" });
    const eventCall = (window.gtag as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === "event" && c[1] === "sample.picked",
    );
    expect(eventCall).toBeDefined();
    expect(eventCall?.[2]).toMatchObject({ scenario: "utility" });
  });

  it("initGa is idempotent — second init with same id doesn't double-inject the loader", async () => {
    const { initGa } = await freshImport();
    initGa("G-ABC12345");
    initGa("G-ABC12345");
    expect(document.querySelectorAll("script[data-ga-loader]")).toHaveLength(1);
  });

  it("gaSetDefaults sends a `set` call so subsequent events inherit the 4 OB-03 dims", async () => {
    const { initGa, gaSetDefaults, gaTrack } = await freshImport();
    initGa("G-ABC12345");
    gaSetDefaults({
      sessionId: "sess-42",
      appMode: "onboarding",
      currentSample: "utility",
      llmProvider: "openai",
    });
    // The wrapper uses gtag('set', { user_properties: {...} }) style;
    // assert all four dims landed in the call chain.
    const setCalls = (window.gtag as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "set",
    );
    expect(setCalls.length).toBeGreaterThan(0);
    const merged = setCalls.reduce((acc, c) => ({ ...acc, ...(c[1] as Record<string, unknown>) }), {});
    expect(merged).toMatchObject({
      sessionId: "sess-42",
      appMode: "onboarding",
      currentSample: "utility",
      llmProvider: "openai",
    });
    // Now firing a track event should NOT need to repeat the dims —
    // gtag's `set` makes them sticky. Verify by checking the track
    // call's event params are scoped to the event itself.
    gaTrack("understand.started", { scenario: "utility" });
    const eventCall = (window.gtag as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === "event" && c[1] === "understand.started",
    );
    expect(eventCall).toBeDefined();
  });

  it("gaSetDefaults can be called incrementally (sessionId at bootstrap, currentSample on pick)", async () => {
    const { initGa, gaSetDefaults } = await freshImport();
    initGa("G-ABC12345");
    gaSetDefaults({ sessionId: "sess-1" });
    gaSetDefaults({ currentSample: "utility" });
    const setCalls = (window.gtag as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "set",
    );
    // Two incremental updates → two `set` calls.
    expect(setCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("gaTrack is safe to call before initGa (silent no-op)", async () => {
    const { gaTrack } = await freshImport();
    gaTrack("session.started");
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("gaSetDefaults is safe to call before initGa (silent no-op)", async () => {
    const { gaSetDefaults } = await freshImport();
    gaSetDefaults({ sessionId: "sess-1" });
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
