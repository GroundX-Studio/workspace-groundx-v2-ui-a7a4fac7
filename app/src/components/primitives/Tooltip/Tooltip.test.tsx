import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Tooltip from "./Tooltip";

describe("Tooltip", () => {
  it("shows tooltip content and preserves the wrapped control", () => {
    render(
      <Tooltip title="Explains the quota" open TransitionProps={{ timeout: 0 }}>
        <button type="button">Info</button>
      </Tooltip>,
    );

    expect(screen.getByRole("button", { name: "Explains the quota" })).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Explains the quota");
  });

  it("supports arrow tooltips for icon hints", () => {
    render(
      <Tooltip title="Copy bucket id" arrow open TransitionProps={{ timeout: 0 }}>
        <button type="button" aria-label="Copy">
          Copy
        </button>
      </Tooltip>,
    );

    expect(screen.getByRole("tooltip")).toHaveTextContent("Copy bucket id");
  });
});
