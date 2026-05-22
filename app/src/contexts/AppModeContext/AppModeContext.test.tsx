import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppModeProvider, useAppMode } from "./AppModeContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppModeProvider byoPagesLimit={100}>{children}</AppModeProvider>
);

describe("AppModeContext", () => {
  it("defaults to onboarding mode + anonymous + null scenario", () => {
    const { result } = renderHook(() => useAppMode(), { wrapper });
    expect(result.current.state.mode).toBe("onboarding");
    expect(result.current.state.authState).toBe("anonymous");
    expect(result.current.state.scenario).toBeNull();
    expect(result.current.state.usage.byoPages).toBe(0);
    expect(result.current.state.usage.byoPagesLimit).toBe(100);
  });

  it("setScenario updates scenario", () => {
    const { result } = renderHook(() => useAppMode(), { wrapper });
    act(() => result.current.setScenario("utility"));
    expect(result.current.state.scenario).toBe("utility");
  });

  it("promoteToSignedIn resets BYO pages counter (free-tier reset on sign-in)", () => {
    const { result } = renderHook(() => useAppMode(), { wrapper });
    act(() => result.current.incrementByoPages(42));
    expect(result.current.state.usage.byoPages).toBe(42);
    act(() => result.current.promoteToSignedIn());
    expect(result.current.state.authState).toBe("signed-in");
    expect(result.current.state.usage.byoPages).toBe(0);
  });

  it("flipToSteady transitions onboarding → steady", () => {
    const { result } = renderHook(() => useAppMode(), { wrapper });
    act(() => result.current.flipToSteady());
    expect(result.current.state.mode).toBe("steady");
  });

  it("incrementByoPages accumulates", () => {
    const { result } = renderHook(() => useAppMode(), { wrapper });
    act(() => result.current.incrementByoPages(10));
    act(() => result.current.incrementByoPages(15));
    expect(result.current.state.usage.byoPages).toBe(25);
  });

  it("throws when used outside provider", () => {
    // Silence React's error-boundary console.error for this test only — the
    // global setup throws on any console.error to catch surprises.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useAppMode())).toThrow(/AppModeProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
