import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Caption } from "./Caption";

describe("Caption primitive", () => {
  it("renders as <span> by default", () => {
    render(<Caption>Microcopy</Caption>);
    expect(screen.getByText(/microcopy/i).tagName.toLowerCase()).toBe("span");
  });

  it("respects an explicit component override", () => {
    render(<Caption component="figcaption">Figure</Caption>);
    expect(screen.getByText(/figure/i).tagName.toLowerCase()).toBe("figcaption");
  });

  it("uses MUI caption variant", () => {
    render(<Caption>Tiny</Caption>);
    expect(screen.getByText(/tiny/i).className).toMatch(/MuiTypography-caption/);
  });

  it("exposes data-typography=caption", () => {
    render(<Caption>Probe</Caption>);
    expect(screen.getByText(/probe/i).getAttribute("data-typography")).toBe("caption");
  });
});
