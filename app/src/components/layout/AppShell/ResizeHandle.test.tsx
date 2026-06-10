import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResizeHandle } from "./ResizeHandle";

/**
 * Regression guard (slider-regression-audit). The ResizeHandle is the shared
 * divider behind BOTH the chat ↔ canvas split (AppShell) and the document ↔
 * schema split (Extract). It previously shipped with ZERO tests, so a break in
 * its aria contract, pointer wiring, or keyboard resize would pass CI silently.
 * These tests pin the contract every consumer relies on.
 */
describe("ResizeHandle", () => {
  const noop = () => {};
  const noopBump = () => 0;

  it("renders a vertical separator carrying its aria value bounds", () => {
    render(<ResizeHandle value={320} min={280} max={510} onPointerDown={noop} onBump={noopBump} />);
    const sep = screen.getByRole("separator");
    expect(sep).toHaveAttribute("aria-orientation", "vertical");
    expect(sep).toHaveAttribute("aria-valuenow", "320");
    expect(sep).toHaveAttribute("aria-valuemin", "280");
    expect(sep).toHaveAttribute("aria-valuemax", "510");
    expect(sep).toHaveAttribute("tabindex", "0");
  });

  it("forwards the pointer-down clientX so the drag can start (the bit that makes it move)", () => {
    const onPointerDown = vi.fn();
    render(<ResizeHandle value={320} onPointerDown={onPointerDown} onBump={noopBump} />);
    // jsdom's PointerEvent doesn't carry clientX; a MouseEvent typed as
    // "pointerdown" does, and React still dispatches it to onPointerDown.
    fireEvent(
      screen.getByRole("separator"),
      new MouseEvent("pointerdown", { clientX: 642, bubbles: true, cancelable: true }),
    );
    expect(onPointerDown).toHaveBeenCalledWith(642);
  });

  it("resizes via the keyboard: ±16px on arrows, ±8px with Shift", () => {
    const onBump = vi.fn(() => 0);
    render(<ResizeHandle value={320} onPointerDown={noop} onBump={onBump} />);
    const sep = screen.getByRole("separator");
    fireEvent.keyDown(sep, { key: "ArrowRight" });
    expect(onBump).toHaveBeenLastCalledWith(16);
    fireEvent.keyDown(sep, { key: "ArrowLeft" });
    expect(onBump).toHaveBeenLastCalledWith(-16);
    fireEvent.keyDown(sep, { key: "ArrowLeft", shiftKey: true });
    expect(onBump).toHaveBeenLastCalledWith(-8);
  });

  it("Home/End jump to the extremes", () => {
    const onBump = vi.fn(() => 0);
    render(<ResizeHandle value={320} onPointerDown={noop} onBump={onBump} />);
    const sep = screen.getByRole("separator");
    fireEvent.keyDown(sep, { key: "Home" });
    expect(onBump).toHaveBeenLastCalledWith(-Number.MAX_SAFE_INTEGER);
    fireEvent.keyDown(sep, { key: "End" });
    expect(onBump).toHaveBeenLastCalledWith(Number.MAX_SAFE_INTEGER);
  });

  it("honors a custom ariaLabel so it can be reused for non-chat splits", () => {
    render(
      <ResizeHandle
        value={320}
        ariaLabel="Resize document pane"
        onPointerDown={noop}
        onBump={noopBump}
      />,
    );
    expect(screen.getByRole("separator", { name: "Resize document pane" })).toBeInTheDocument();
  });
});
