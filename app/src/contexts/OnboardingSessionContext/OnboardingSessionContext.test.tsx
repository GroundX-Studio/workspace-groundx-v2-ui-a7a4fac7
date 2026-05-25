import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
});
