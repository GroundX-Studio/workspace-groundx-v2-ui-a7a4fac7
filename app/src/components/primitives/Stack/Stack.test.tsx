import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Stack } from "./Stack";

describe("Stack primitive", () => {
  it("renders children", () => {
    render(
      <Stack>
        <span>A</span>
        <span>B</span>
      </Stack>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("marks itself as brand-default via data-stack", () => {
    render(
      <Stack>
        <span>probe</span>
      </Stack>,
    );
    expect(screen.getByText("probe").parentElement?.getAttribute("data-stack")).toBe(
      "brand-default",
    );
  });

  it("accepts a direction override", () => {
    render(
      <Stack direction="row">
        <span>row</span>
      </Stack>,
    );
    const stack = screen.getByText("row").parentElement;
    // MUI emits a class hint for the direction; the row variant should
    // be present.
    expect(stack?.className).toMatch(/MuiStack-root/);
  });

  it("accepts a gap override", () => {
    render(
      <Stack gap={1}>
        <span>tight</span>
      </Stack>,
    );
    expect(screen.getByText("tight")).toBeInTheDocument();
  });
});
