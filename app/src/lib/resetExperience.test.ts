import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DBG-01 (2026-05-28). The reset helper is the single, exhaustive place
// that returns the app to a first-time anonymous visitor. Forward-binding
// invariant: any new app-owned session/state key must be cleared here.
import { clearAppClientStorage, resetExperience } from "./resetExperience";

const resetSession = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetSession.mockClear();
  resetSession.mockResolvedValue({ success: true });
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("clearAppClientStorage", () => {
  it("removes all app-owned localStorage + sessionStorage keys, leaves foreign keys", () => {
    // App-owned (prefix-matched, so future keys are caught too).
    localStorage.setItem("groundx-onboarding.chat-store.v1", "x");
    localStorage.setItem("groundx-onboarding.entity-registry.v1", "x");
    localStorage.setItem("groundx-onboarding.gate-sequence-played", "true");
    localStorage.setItem("appshell.chatWidth.v2", "360");
    localStorage.setItem("x-ray-demo-email", "a@b.com");
    sessionStorage.setItem("groundx-onboarding.thinking-stream-done.utility", "1");
    // Foreign (must survive — not ours to clear).
    localStorage.setItem("some-other-app.token", "keep");
    sessionStorage.setItem("unrelated", "keep");

    clearAppClientStorage();

    expect(localStorage.getItem("groundx-onboarding.chat-store.v1")).toBeNull();
    expect(localStorage.getItem("groundx-onboarding.entity-registry.v1")).toBeNull();
    // P1 — the gate "animated in once" flag is session state; reset replays it.
    expect(localStorage.getItem("groundx-onboarding.gate-sequence-played")).toBeNull();
    expect(localStorage.getItem("appshell.chatWidth.v2")).toBeNull();
    expect(localStorage.getItem("x-ray-demo-email")).toBeNull();
    expect(sessionStorage.getItem("groundx-onboarding.thinking-stream-done.utility")).toBeNull();
    // Foreign keys untouched.
    expect(localStorage.getItem("some-other-app.token")).toBe("keep");
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("catches future app-namespaced keys via prefix match", () => {
    localStorage.setItem("groundx-onboarding.some-future-feature.v9", "x");
    localStorage.setItem("appshell.some-future-pref", "x");
    clearAppClientStorage();
    expect(localStorage.getItem("groundx-onboarding.some-future-feature.v9")).toBeNull();
    expect(localStorage.getItem("appshell.some-future-pref")).toBeNull();
  });
});

describe("resetExperience", () => {
  it("clears client storage, calls the server reset, then navigates to /onboarding", async () => {
    localStorage.setItem("groundx-onboarding.chat-store.v1", "x");
    const navigate = vi.fn();

    await resetExperience({ navigate, resetSession });

    expect(localStorage.getItem("groundx-onboarding.chat-store.v1")).toBeNull();
    expect(resetSession).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });

  it("navigates even if the server reset fails (best-effort)", async () => {
    resetSession.mockRejectedValueOnce(new Error("network"));
    const navigate = vi.fn();
    await resetExperience({ navigate, resetSession });
    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });
});
