import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasOrchestratorProvider, useCanvasOrchestrator } from "./CanvasOrchestratorContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CanvasOrchestratorProvider now={() => 1700000000000}>{children}</CanvasOrchestratorProvider>
);

describe("CanvasOrchestratorContext", () => {
  it("dispatches and stamps intents with monotonic id + source", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    let first;
    let second;
    act(() => {
      first = result.current.dispatch({ kind: "openDocument", documentId: "d1" });
      second = result.current.dispatch({ kind: "openDocument", documentId: "d2" }, "agent");
    });
    expect(first!.intentId).toBe(1);
    expect(first!.source).toBe("user");
    expect(first!.ts).toBe(1700000000000);
    expect(second!.intentId).toBe(2);
    expect(second!.source).toBe("agent");
    expect(result.current.lastAppliedIntentId).toBe(2);
  });

  it("routes intent to registered adapter (typed by kind)", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    const apply = vi.fn();
    act(() => {
      result.current.registerAdapter({ kind: "openDocument", apply });
    });
    act(() => {
      result.current.dispatch({ kind: "openDocument", documentId: "d1", page: 3 });
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ kind: "openDocument", documentId: "d1", page: 3 });
  });

  it("intent with no registered adapter still stamps + advances lastAppliedIntentId", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    act(() => {
      result.current.dispatch({ kind: "showReport", templateId: "tpl", scope: { type: "bucket", bucketId: 1 } });
    });
    expect(result.current.lastAppliedIntentId).toBe(1);
  });

  it("registerAdapter returns an unsubscribe that removes only the same adapter", () => {
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    const apply1 = vi.fn();
    const apply2 = vi.fn();
    let unsubscribe1: (() => void) | undefined;
    act(() => {
      unsubscribe1 = result.current.registerAdapter({ kind: "openDocument", apply: apply1 });
      result.current.registerAdapter({ kind: "openDocument", apply: apply2 });
    });
    // Last registration wins.
    act(() => {
      result.current.dispatch({ kind: "openDocument", documentId: "d" });
    });
    expect(apply2).toHaveBeenCalledTimes(1);
    expect(apply1).not.toHaveBeenCalled();
    // Unsubscribing the *first* adapter must not remove apply2.
    act(() => {
      unsubscribe1!();
      result.current.dispatch({ kind: "openDocument", documentId: "d2" });
    });
    expect(apply2).toHaveBeenCalledTimes(2);
  });

  it("swallows synchronous adapter errors and still stamps", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useCanvasOrchestrator(), { wrapper });
    act(() => {
      result.current.registerAdapter({
        kind: "showSample",
        apply: () => {
          throw new Error("boom");
        },
      });
    });
    act(() => {
      result.current.dispatch({ kind: "showSample", scenario: "utility" });
    });
    expect(result.current.lastAppliedIntentId).toBe(1);
    errorSpy.mockRestore();
  });

  it("throws when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useCanvasOrchestrator())).toThrow(/CanvasOrchestratorProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
