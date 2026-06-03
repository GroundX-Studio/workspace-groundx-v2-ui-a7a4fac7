import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { ApiProvider } from "@/contexts/ApiContext";
import { makeFakeApi } from "@/test/makeFakeApi";

import { OnboardingSessionProvider, useOnboardingSession } from "./OnboardingSessionContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ApiProvider value={makeFakeApi()}>
    <OnboardingSessionProvider>{children}</OnboardingSessionProvider>
  </ApiProvider>
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

  it("open → committed(register) terminal", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("register"));
    expect(result.current.state.gate.status).toBe("committed");
    if (result.current.state.gate.status === "committed") {
      expect(result.current.state.gate.method).toBe("register");
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
    act(() => result.current.commitGate("register"));
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

  it("dismissed → open(same trigger) ALSO re-enters the gate (BYO re-click)", () => {
    // Bug repro: user clicks Sign Up (open BYO), dismisses (X), then
    // clicks Sign Up again with the same trigger. The gate must re-open,
    // not stay stuck in `dismissed`. The earlier same-trigger short-circuit
    // was too eager — it blocked a legitimate re-trigger from the user's
    // own re-click.
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("byo"));
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("dismissed");
    act(() => result.current.openGate("byo"));
    expect(result.current.state.gate.status).toBe("open");
    if (result.current.state.gate.status === "open") {
      expect(result.current.state.gate.trigger).toBe("byo");
    }
  });

  it("dismissGate from idle is a no-op (no spurious dismissed state)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("idle");
  });

  // ── back-out from BYO signup must reset the gate ────────────────────

  it("advanceFrame('f1') dismisses an OPEN gate (user backed out of signup)", () => {
    // Bug repro: user clicks Sign Up on F1 (opens gate with trigger=byo),
    // then navigates back to /onboarding. The URL handler fires
    // advanceFrame("f1"). The gate must NOT remain open — otherwise the
    // SignUpWidget keeps covering the canvas and the F1 picker can't
    // launch a sample.
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("byo"));
    expect(result.current.state.gate.status).toBe("open");
    act(() => result.current.advanceFrame("f1"));
    // The open gate is dismissed when the user returns to the picker.
    expect(result.current.state.gate.status).not.toBe("open");
  });

  it("advanceFrame('f1') preserves a COMMITTED gate (signed-in user stays signed-in)", () => {
    // Defensive: a committed gate represents a signed-in session, which
    // is global. Returning to F1 must NOT log the user out.
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("register"));
    expect(result.current.state.gate.status).toBe("committed");
    act(() => result.current.advanceFrame("f1"));
    expect(result.current.state.gate.status).toBe("committed");
  });

  it("pickScenario dismisses an OPEN gate (user chose to engage with a sample instead)", () => {
    // Defense in depth: even if advanceFrame("f1") wasn't called,
    // pickScenario means the user committed to the sample flow — the
    // SignUpWidget overlay must clear so UnderstandView can render.
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("byo"));
    expect(result.current.state.gate.status).toBe("open");
    act(() => result.current.pickScenario("utility"));
    expect(result.current.state.gate.status).not.toBe("open");
  });

  it("dismissGate from committed is a no-op (committed wins)", () => {
    const { result } = renderHook(() => useOnboardingSession(), { wrapper });
    act(() => result.current.openGate("save"));
    act(() => result.current.commitGate("register"));
    act(() => result.current.dismissGate());
    expect(result.current.state.gate.status).toBe("committed");
  });
});
