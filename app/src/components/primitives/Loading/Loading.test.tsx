import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BreathingMark } from "./BreathingMark";
import { Loading } from "./Loading";

describe("BreathingMark — the one loading visual (unified-loader §1.2a)", () => {
  it("renders a status-role green mark at the requested size", () => {
    render(<BreathingMark size="lg" aria-label="Reading the extraction" />);
    const mark = screen.getByRole("status", { name: "Reading the extraction" });
    expect(mark).toHaveAttribute("data-size", "lg");
    expect(screen.getByTestId("breathing-mark-core")).toBeInTheDocument();
    expect(screen.getByTestId("breathing-mark-ring")).toBeInTheDocument();
  });

  it("declares a reduced-motion fallback (static mark, no animation)", () => {
    render(<BreathingMark />);
    const css = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("");
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("Loading — the in-place-of-content boundary (§1.2b/§1.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders its children when not loading", () => {
    render(
      <Loading loading={false}>
        <div data-testid="real-content">hi</div>
      </Loading>,
    );
    expect(screen.getByTestId("real-content")).toBeInTheDocument();
    expect(screen.queryByTestId("breathing-mark")).toBeNull();
  });

  it("renders the mark + message in place of children while loading (delay 0)", () => {
    render(
      <Loading loading delay={0} size="lg" message="Reading the extraction…">
        <div data-testid="real-content">hi</div>
      </Loading>,
    );
    expect(screen.queryByTestId("real-content")).toBeNull();
    expect(screen.getByTestId("breathing-mark")).toBeInTheDocument();
    expect(screen.getByText("Reading the extraction…")).toBeInTheDocument();
  });

  it("anti-flash (§1.3): a region that resolves WITHIN the delay never shows the mark", () => {
    const { rerender } = render(
      <Loading loading delay={150}>
        <div data-testid="real-content">hi</div>
      </Loading>,
    );
    // 100ms in: still inside the window — no mark
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByTestId("breathing-mark")).toBeNull();
    // resolves before 150ms → content, and the mark never rendered
    rerender(
      <Loading loading={false} delay={150}>
        <div data-testid="real-content">hi</div>
      </Loading>,
    );
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId("real-content")).toBeInTheDocument();
    expect(screen.queryByTestId("breathing-mark")).toBeNull();
  });

  it("anti-flash: loading past the delay shows the mark", () => {
    render(
      <Loading loading delay={150}>
        <div data-testid="real-content">hi</div>
      </Loading>,
    );
    expect(screen.queryByTestId("breathing-mark")).toBeNull();
    act(() => vi.advanceTimersByTime(160));
    expect(screen.getByTestId("breathing-mark")).toBeInTheDocument();
  });
});
