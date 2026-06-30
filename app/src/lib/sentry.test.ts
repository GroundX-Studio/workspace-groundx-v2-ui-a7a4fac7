import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CF-13 — thin Sentry wrapper. We mock `@sentry/browser` here so we
// can assert the wrapper's contract without actually shipping events.
const initSpy = vi.fn();
const captureSpy = vi.fn();
vi.mock("@sentry/browser", () => ({
  init: (...args: unknown[]) => initSpy(...args),
  captureException: (...args: unknown[]) => captureSpy(...args),
}));

// Import AFTER the mock so the wrapper picks up the spies.
async function freshImport(): Promise<typeof import("./sentry")> {
  vi.resetModules();
  return await import("./sentry");
}

beforeEach(() => {
  initSpy.mockReset();
  captureSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sentry wrapper (CF-13)", () => {
  it("initSentry with no dsn → does NOT call Sentry.init; captureException becomes a no-op", async () => {
    const { initSentry, captureException } = await freshImport();
    const ok = initSentry(undefined);
    expect(ok).toBe(false);
    expect(initSpy).not.toHaveBeenCalled();
    captureException(new Error("boom"));
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("initSentry with empty-string dsn → also a no-op (helps with unset env var)", async () => {
    const { initSentry, captureException } = await freshImport();
    expect(initSentry("")).toBe(false);
    captureException(new Error("boom"));
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("initSentry with a real DSN → calls Sentry.init; captureException forwards", async () => {
    const { initSentry, captureException } = await freshImport();
    const ok = initSentry("https://abc@sentry.example/1");
    expect(ok).toBe(true);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy.mock.calls[0][0]).toMatchObject({
      dsn: "https://abc@sentry.example/1",
    });
    const err = new Error("uh-oh");
    captureException(err, { route: "/api/chat/messages" });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy.mock.calls[0][0]).toBe(err);
    // Extras flow through as the second arg (Sentry scope-style).
    expect(captureSpy.mock.calls[0][1]).toMatchObject({
      extra: { route: "/api/chat/messages" },
    });
  });

  it("captureException is safe to call before initSentry (silent no-op)", async () => {
    const { captureException } = await freshImport();
    captureException(new Error("early boom"));
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("initSentry is idempotent — re-init doesn't double-fire", async () => {
    const { initSentry } = await freshImport();
    initSentry("https://abc@sentry.example/1");
    initSentry("https://abc@sentry.example/1");
    expect(initSpy).toHaveBeenCalledTimes(1);
  });
});
