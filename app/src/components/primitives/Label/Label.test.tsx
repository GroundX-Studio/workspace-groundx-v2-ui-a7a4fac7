import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Label } from "./Label";

describe("Label primitive", () => {
  it("variant=form renders as <label> by default", () => {
    render(<Label htmlFor="email">Email</Label>);
    const el = screen.getByText(/email/i);
    expect(el.tagName.toLowerCase()).toBe("label");
    expect(el.getAttribute("for")).toBe("email");
  });

  it("variant=eyebrow renders as <span> in uppercase", () => {
    render(<Label variant="eyebrow">Capability</Label>);
    const el = screen.getByText(/capability/i);
    expect(el.tagName.toLowerCase()).toBe("span");
    const styles = window.getComputedStyle(el);
    expect(styles.textTransform).toBe("uppercase");
  });

  it("form variant does not uppercase", () => {
    render(<Label>Name</Label>);
    const styles = window.getComputedStyle(screen.getByText(/name/i));
    expect(styles.textTransform).toBe("none");
  });

  it("respects an explicit component override", () => {
    render(
      <Label variant="eyebrow" component="div">Custom</Label>,
    );
    expect(screen.getByText(/custom/i).tagName.toLowerCase()).toBe("div");
  });

  it("exposes data-typography introspection attrs", () => {
    render(<Label variant="eyebrow">Probe</Label>);
    const el = screen.getByText(/probe/i);
    expect(el.getAttribute("data-typography")).toBe("label");
    expect(el.getAttribute("data-typography-variant")).toBe("eyebrow");
  });
});
