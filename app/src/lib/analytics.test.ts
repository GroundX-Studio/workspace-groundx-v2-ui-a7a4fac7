import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OB-02 — thin PostHog wrapper. We mock posthog-js here so we can
// assert the wrapper's contract without making a real network call.
const initSpy = vi.fn();
const captureSpy = vi.fn();
const identifySpy = vi.fn();
const resetSpy = vi.fn();
vi.mock("posthog-js", () => ({
  default: {
    init: (...args: unknown[]) => initSpy(...args),
    capture: (...args: unknown[]) => captureSpy(...args),
    identify: (...args: unknown[]) => identifySpy(...args),
    reset: (...args: unknown[]) => resetSpy(...args),
  },
}));

// OB-03 — mock the GA wrapper so we can assert fan-out without
// double-counting against real gtag calls.
const gaTrackSpy = vi.fn();
vi.mock("./ga", () => ({
  gaTrack: (...args: unknown[]) => gaTrackSpy(...args),
  initGa: vi.fn(() => false),
  gaSetDefaults: vi.fn(),
}));

async function freshImport(): Promise<typeof import("./analytics")> {
  vi.resetModules();
  return await import("./analytics");
}

beforeEach(() => {
  initSpy.mockReset();
  captureSpy.mockReset();
  identifySpy.mockReset();
  resetSpy.mockReset();
  gaTrackSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("analytics wrapper (OB-02)", () => {
  it("no apiKey → does NOT call posthog.init; track/identify become no-ops", async () => {
    const { initAnalytics, track, identify } = await freshImport();
    const ok = initAnalytics(undefined);
    expect(ok).toBe(false);
    expect(initSpy).not.toHaveBeenCalled();
    track("session.started", { mode: "onboarding" });
    identify("anon-1");
    expect(captureSpy).not.toHaveBeenCalled();
    expect(identifySpy).not.toHaveBeenCalled();
  });

  it("empty-string apiKey → also a no-op (defends against unset env var)", async () => {
    const { initAnalytics, track } = await freshImport();
    expect(initAnalytics("")).toBe(false);
    track("session.started");
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("real apiKey → calls posthog.init with key + host; track + identify forward", async () => {
    const { initAnalytics, track, identify } = await freshImport();
    const ok = initAnalytics("phc_abc", "https://app.posthog.com");
    expect(ok).toBe(true);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy.mock.calls[0][0]).toBe("phc_abc");
    expect(initSpy.mock.calls[0][1]).toMatchObject({ api_host: "https://app.posthog.com" });

    track("sample.picked", { sample: "utility" });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy.mock.calls[0]).toEqual(["sample.picked", { sample: "utility" }]);

    identify("anon-xyz", { plan: "free" });
    expect(identifySpy).toHaveBeenCalledTimes(1);
    expect(identifySpy.mock.calls[0]).toEqual(["anon-xyz", { plan: "free" }]);
  });

  it("initAnalytics is idempotent — re-init doesn't double-fire", async () => {
    const { initAnalytics } = await freshImport();
    initAnalytics("phc_abc");
    initAnalytics("phc_abc");
    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it("host defaults to PostHog cloud when unspecified", async () => {
    const { initAnalytics } = await freshImport();
    initAnalytics("phc_abc");
    expect(initSpy.mock.calls[0][1].api_host).toBe("https://us.i.posthog.com");
  });

  it("track is safe to call before initAnalytics (silent no-op)", async () => {
    const { track } = await freshImport();
    track("session.started");
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("resetAnalytics clears the identified user (e.g. on logout)", async () => {
    const { initAnalytics, resetAnalytics } = await freshImport();
    initAnalytics("phc_abc");
    resetAnalytics();
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  // OB-03 — fan-out: track() forwards to BOTH PostHog and GA4.
  describe("OB-03 fan-out to GA4", () => {
    it("track fires gaTrack regardless of whether PostHog was init'd", async () => {
      const { track } = await freshImport();
      // No PostHog init — capture shouldn't fire.
      track("sample.picked", { scenario: "utility" });
      expect(captureSpy).not.toHaveBeenCalled();
      // But GA fan-out always runs (gaTrack is itself a no-op when GA
      // wasn't init'd, but the wrapper still calls it).
      expect(gaTrackSpy).toHaveBeenCalledTimes(1);
      expect(gaTrackSpy).toHaveBeenCalledWith("sample.picked", { scenario: "utility" });
    });

    it("track fires BOTH gaTrack and posthog.capture when PostHog is init'd", async () => {
      const { initAnalytics, track } = await freshImport();
      initAnalytics("phc_abc");
      track("understand.started", { scenario: "loan" });
      expect(gaTrackSpy).toHaveBeenCalledWith("understand.started", { scenario: "loan" });
      expect(captureSpy).toHaveBeenCalledWith("understand.started", { scenario: "loan" });
    });
  });
});
