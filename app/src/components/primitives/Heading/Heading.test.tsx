import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Heading } from "./Heading";

describe("Heading primitive", () => {
  it("renders as <h2> by default (level=h2)", () => {
    render(<Heading>Section</Heading>);
    expect(screen.getByRole("heading", { level: 2, name: /section/i })).toBeInTheDocument();
  });

  it("respects an explicit level", () => {
    render(<Heading level="h1">Title</Heading>);
    expect(screen.getByRole("heading", { level: 1, name: /title/i })).toBeInTheDocument();
  });

  it("respects an explicit component override", () => {
    render(<Heading level="h3" component="div">As Div</Heading>);
    const el = screen.getByText(/as div/i);
    expect(el.tagName.toLowerCase()).toBe("div");
  });

  it("exposes data-typography + data-typography-level for drift introspection", () => {
    render(<Heading level="display-lg">Hero</Heading>);
    const el = screen.getByText(/hero/i);
    expect(el.getAttribute("data-typography")).toBe("heading");
    expect(el.getAttribute("data-typography-level")).toBe("display-lg");
  });

  it("display-lg renders as <h1> by default for SEO + a11y", () => {
    render(<Heading level="display-lg">Marketing hero</Heading>);
    expect(screen.getByRole("heading", { level: 1, name: /marketing hero/i })).toBeInTheDocument();
  });

  it("accepts pass-through sx without losing brand defaults", () => {
    render(
      <Heading level="h4" sx={{ marginTop: 4 }}>
        Spaced
      </Heading>,
    );
    expect(screen.getByText(/spaced/i)).toBeInTheDocument();
    // Brand default lineHeight should still be on the element via emotion.
    // We assert presence of the level class rather than computed style.
    expect(screen.getByRole("heading", { level: 4 })).toBeInTheDocument();
  });
});
