import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// OB-02: mock the analytics wrapper so we can assert track() fires at
// each funnel boundary without making real PostHog calls.
vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  identify: vi.fn(),
  initAnalytics: vi.fn(() => false),
  resetAnalytics: vi.fn(),
}));
import { track } from "@/lib/analytics";
// OB-03: mock the GA wrapper too — onboarding bootstraps + pickScenario
// now call gaSetDefaults to wire the sticky dimensions.
vi.mock("@/lib/ga", () => ({
  gaSetDefaults: vi.fn(),
  initGa: vi.fn(() => false),
  gaTrack: vi.fn(),
}));
import { gaSetDefaults } from "@/lib/ga";

import { OnboardingSessionProvider, useOnboardingSession } from "./OnboardingSessionContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OnboardingSessionProvider>{children}</OnboardingSessionProvider>
);

describe("OnboardingSessionContext", () => {
  it("starts on F1, no scenario, idle gate, no session id", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    expect(result.current.state.currentFrame).toBe("f1");
    expect(result.current.state.scenario).toBeNull();
    expect(result.current.state.gate.status).toBe("idle");
    expect(result.current.state.sessionId).toBeNull();
    expect(result.current.state.completedFrames.size).toBe(0);
  });

  it("bootstrapSession sets server-issued id", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.bootstrapSession("sess_abc"));
    expect(result.current.state.sessionId).toBe("sess_abc");
  });

  it("advanceFrame marks the previous frame completed (inside an active sample)", () => {
    // advanceFrame operates on the active entity. From the F1 picker
    // with no entity active it's a no-op — the user must
    // pickScenario (or trigger BYO) first. Picking a sample lands
    // the user on f2; advancing then marks f2 completed.
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.pickScenario("utility"));
    expect(result.current.state.currentFrame).toBe("f2");
    act(() => result.current.advanceFrame("f3"));
    expect(result.current.state.currentFrame).toBe("f3");
    expect(result.current.state.completedFrames.has("f2")).toBe(true);
  });

  it("openGate sets open status with trigger", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    expect(result.current.state.gate.status).toBe("open");
    if (result.current.state.gate.status === "open") {
      expect(result.current.state.gate.trigger).toBe("save");
    }
  });

  it("dismissGate after open → dismissed", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("export"));
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("dismissed");
  });

  it("dismissGate from idle is a no-op", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("idle");
  });

  it("once committed, openGate is a no-op (single commit per session)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("register"));
    act(() => result.current.openGate("threshold"));
    expect(result.current.state.gate.status).toBe("committed");
  });

  it("pickScenario sets active scenario", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.pickScenario("solar"));
    expect(result.current.state.scenario).toBe("solar");
  });

  it("throws when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useOnboardingSession())).toThrow(/OnboardingSessionProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });

  // OB-02 — PostHog event-firing at each funnel boundary. The wrapper
  // is mocked at the top of this file; each test asserts the right
  // (event, props) reached `track()`. Event names come from the OB-02
  // backlog row.
  describe("OB-02 PostHog telemetry boundaries", () => {
    function findTrack(event: string): unknown[] | undefined {
      return vi.mocked(track).mock.calls.find((c) => c[0] === event);
    }

    it("bootstrapSession → fires session.started with sessionId + mode", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.bootstrapSession("sess-99"));
      const call = findTrack("session.started");
      expect(call).toBeDefined();
      expect(call?.[1]).toMatchObject({ sessionId: "sess-99", mode: "onboarding" });
    });

    it("OB-03: bootstrapSession → calls gaSetDefaults with sessionId", () => {
      vi.mocked(gaSetDefaults).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.bootstrapSession("sess-99"));
      expect(gaSetDefaults).toHaveBeenCalledWith({ sessionId: "sess-99" });
    });

    it("OB-03: pickScenario → calls gaSetDefaults with currentSample", () => {
      vi.mocked(gaSetDefaults).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("loan"));
      expect(gaSetDefaults).toHaveBeenCalledWith({ currentSample: "loan" });
    });

    it("pickScenario → fires sample.picked AND understand.started", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      expect(findTrack("sample.picked")?.[1]).toMatchObject({ scenario: "utility" });
      expect(findTrack("understand.started")?.[1]).toMatchObject({ scenario: "utility" });
    });

    it("advanceFrame(f3) → fires understand.completed (transition out of F2)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      vi.mocked(track).mockReset(); // ignore the pick-scenario events
      act(() => result.current.advanceFrame("f3"));
      const call = findTrack("understand.completed");
      expect(call).toBeDefined();
      expect(call?.[1]).toMatchObject({ fromFrame: "f2", toFrame: "f3" });
    });

    it("advanceFrame(f5) → does NOT fire understand.completed (F5 is past F3)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.pickScenario("utility"));
      vi.mocked(track).mockReset();
      act(() => result.current.advanceFrame("f5"));
      expect(findTrack("understand.completed")).toBeUndefined();
    });

    it("openGate → fires gate.shown with trigger", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      expect(findTrack("gate.shown")?.[1]).toMatchObject({ trigger: "save" });
    });

    it("openGate while already-open(sameTrigger) → does NOT re-fire gate.shown", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      vi.mocked(track).mockReset();
      act(() => result.current.openGate("save"));
      expect(findTrack("gate.shown")).toBeUndefined();
    });

    it("commitGate(register) → fires signup.completed with method", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      act(() => result.current.commitGate("register"));
      expect(findTrack("signup.completed")?.[1]).toMatchObject({ method: "register" });
    });

    it("commitGate(engineer-call) → also fires signup.completed (funnel parity)", () => {
      vi.mocked(track).mockReset();
      const { result } = renderHook(() => useOnboardingSession(), { wrapper });
      act(() => result.current.openGate("save"));
      act(() => result.current.commitGate("engineer-call"));
      expect(findTrack("signup.completed")?.[1]).toMatchObject({ method: "engineer-call" });
    });
  });
});
