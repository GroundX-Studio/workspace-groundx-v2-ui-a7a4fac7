import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFocusMode } from "./useFocusMode";

describe("useFocusMode", () => {
  it("defaults to split", () => {
    const { result } = renderHook(() => useFocusMode());
    expect(result.current.mode).toBe("split");
  });

  it("accepts initial override", () => {
    const { result } = renderHook(() => useFocusMode({ initial: "focus-canvas" }));
    expect(result.current.mode).toBe("focus-canvas");
  });

  it("setMode transitions between modes", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => result.current.setMode("focus-chat"));
    expect(result.current.mode).toBe("focus-chat");
    act(() => result.current.setMode("split"));
    expect(result.current.mode).toBe("split");
  });

  it("toggleChat goes split → focus-chat → split", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => result.current.toggleChat());
    expect(result.current.mode).toBe("focus-chat");
    act(() => result.current.toggleChat());
    expect(result.current.mode).toBe("split");
  });

  it("toggleCanvas goes split → focus-canvas → split", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => result.current.toggleCanvas());
    expect(result.current.mode).toBe("focus-canvas");
    act(() => result.current.toggleCanvas());
    expect(result.current.mode).toBe("split");
  });

  it("Alt+1 focuses chat", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => {
      fireEvent.keyDown(document, { key: "1", code: "Digit1", altKey: true });
    });
    expect(result.current.mode).toBe("focus-chat");
  });

  it("Alt+2 focuses canvas", () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => {
      fireEvent.keyDown(document, { key: "2", code: "Digit2", altKey: true });
    });
    expect(result.current.mode).toBe("focus-canvas");
  });

  it("Alt+3 returns to split", () => {
    const { result } = renderHook(() => useFocusMode({ initial: "focus-chat" }));
    act(() => {
      fireEvent.keyDown(document, { key: "3", code: "Digit3", altKey: true });
    });
    expect(result.current.mode).toBe("split");
  });

  it("respects enabled=false (hotkeys are off)", () => {
    const { result } = renderHook(() => useFocusMode({ enabled: false }));
    act(() => {
      fireEvent.keyDown(document, { key: "1", code: "Digit1", altKey: true });
    });
    expect(result.current.mode).toBe("split");
  });
});
