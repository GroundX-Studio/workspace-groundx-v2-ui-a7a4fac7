import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BodyText } from "./BodyText";

describe("BodyText primitive", () => {
  it("renders as <p> by default", () => {
    render(<BodyText>Body copy</BodyText>);
    const el = screen.getByText(/body copy/i);
    expect(el.tagName.toLowerCase()).toBe("p");
  });

  it("size=md uses MUI body1", () => {
    render(<BodyText size="md">Standard</BodyText>);
    const el = screen.getByText(/standard/i);
    expect(el.className).toMatch(/MuiTypography-body1/);
  });

  it("size=sm uses MUI body2", () => {
    render(<BodyText size="sm">Smaller</BodyText>);
    const el = screen.getByText(/smaller/i);
    expect(el.className).toMatch(/MuiTypography-body2/);
  });

  it("respects an explicit component override", () => {
    render(
      <BodyText component="span">Inline</BodyText>,
    );
    expect(screen.getByText(/inline/i).tagName.toLowerCase()).toBe("span");
  });

  it("exposes data-typography introspection attrs", () => {
    render(<BodyText size="sm">Probe</BodyText>);
    const el = screen.getByText(/probe/i);
    expect(el.getAttribute("data-typography")).toBe("body");
    expect(el.getAttribute("data-typography-size")).toBe("sm");
  });
});
