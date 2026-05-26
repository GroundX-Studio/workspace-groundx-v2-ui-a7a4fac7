import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthLayout } from "./AuthLayout";

/**
 * TS-11 — AuthLayout coverage. Pure layout wrapper: full-height
 * centered container with a white card. Two contracts: children
 * render inside; `isTall` flips the outer vertical padding.
 */
describe("AuthLayout (TS-11)", () => {
  it("renders its children inside a <main> container", () => {
    render(
      <AuthLayout>
        <p data-testid="auth-child">hello</p>
      </AuthLayout>,
    );
    const child = screen.getByTestId("auth-child");
    expect(child).toBeInTheDocument();
    // Wrapped in a <main> element (Container component="main").
    expect(child.closest("main")).toBeTruthy();
  });

  it("applies tall vertical padding when isTall is set", () => {
    const { container, rerender } = render(<AuthLayout>x</AuthLayout>);
    const outerCompact = container.firstElementChild as HTMLElement;
    const compactPaddingTop = getComputedStyle(outerCompact).paddingTop;

    rerender(<AuthLayout isTall>x</AuthLayout>);
    const outerTall = container.firstElementChild as HTMLElement;
    const tallPaddingTop = getComputedStyle(outerTall).paddingTop;

    // jsdom doesn't compute MUI theme spacing to pixels, but the inline
    // sx still emits different rule keys for the two states. We assert
    // the rendered element has a non-empty class list either way (the
    // sx is applied) and that the two padding strings are different.
    expect(outerCompact.className.length).toBeGreaterThan(0);
    expect(outerTall.className.length).toBeGreaterThan(0);
    // If jsdom does return computed values, they should differ; if it
    // returns the empty string for both (older jsdom), the className
    // diff above is the proof of two distinct theme branches.
    if (compactPaddingTop && tallPaddingTop) {
      expect(compactPaddingTop).not.toBe(tallPaddingTop);
    } else {
      expect(outerCompact.className).not.toBe(outerTall.className);
    }
  });

  it("does not crash when rendered with no children", () => {
    expect(() => render(<AuthLayout>{null}</AuthLayout>)).not.toThrow();
  });
});
