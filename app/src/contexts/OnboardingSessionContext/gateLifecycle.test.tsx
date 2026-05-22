import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnboardingSessionProvider, useOnboardingSession } from "./OnboardingSessionContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OnboardingSessionProvider>{children}</OnboardingSessionProvider>
);

/**
 * LC3 gate lifecycle (from project-state-machines-backout):
 *   idle → open(trigger) → committed(method) | dismissed(trigger)
 *   committed is terminal — openGate from committed is a no-op
 *   dismissed → open(trigger) is allowed (re-trigger re-opens same gate)
 *
 * LC5 back-out: dismiss preserves prior trigger context so telemetry can
 * attribute the dismissal back to the originating action.
 */
describe("LC3 · gate lifecycle state machine", () => {
  it("idle → open(save) records the trigger and opened-at", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    expect(result.current.state.gate.status).toBe("idle");
    act(() => result.current.openGate("save"));
    expect(result.current.state.gate.status).toBe("open");
    if (result.current.state.gate.status === "open") {
      expect(result.current.state.gate.trigger).toBe("save");
      expect(result.current.state.gate.openedAt).toBeGreaterThan(0);
    }
  });

  it("idle → open(export) records export trigger", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("export"));
    if (result.current.state.gate.status === "open") {
      expect(result.current.state.gate.trigger).toBe("export");
    }
  });

  it("idle → open(byo) records byo trigger (BYO upload sign-in path)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("byo"));
    if (result.current.state.gate.status === "open") {
      expect(result.current.state.gate.trigger).toBe("byo");
    }
  });

  it("idle → open(threshold) records threshold trigger (free-tier ceiling)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("threshold"));
    if (result.current.state.gate.status === "open") {
      expect(result.current.state.gate.trigger).toBe("threshold");
    }
  });

  it("open → committed(magic-link) terminal", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("magic-link"));
    expect(result.current.state.gate.status).toBe("committed");
    if (result.current.state.gate.status === "committed") {
      expect(result.current.state.gate.method).toBe("magic-link");
    }
  });

  it("open → committed(engineer-call) terminal", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("engineer-call"));
    if (result.current.state.gate.status === "committed") {
      expect(result.current.state.gate.method).toBe("engineer-call");
    }
  });

  it("committed is terminal — openGate from committed is a no-op", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("magic-link"));
    act(() => result.current.openGate("threshold"));
    expect(result.current.state.gate.status).toBe("committed");
  });

  it("dismissed preserves the original trigger (LC5 audit telemetry)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("export"));
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("dismissed");
    if (result.current.state.gate.status === "dismissed") {
      expect(result.current.state.gate.trigger).toBe("export");
      expect(result.current.state.gate.dismissedAt).toBeGreaterThan(0);
    }
  });

  it("dismissed → open re-enters the gate (re-trigger semantics)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("dismissed");
    act(() => result.current.openGate("threshold"));
    expect(result.current.state.gate.status).toBe("open");
    if (result.current.state.gate.status === "open") {
      // The NEW trigger replaces the previous dismissed trigger
      expect(result.current.state.gate.trigger).toBe("threshold");
    }
  });

  it("dismissGate from idle is a no-op (no spurious dismissed state)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("idle");
  });

  it("dismissGate from committed is a no-op (committed wins)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("magic-link"));
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("committed");
  });
});
