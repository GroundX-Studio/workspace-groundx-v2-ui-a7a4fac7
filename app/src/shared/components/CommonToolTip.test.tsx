import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CommonToolTip from "./CommonToolTip";

describe("CommonToolTip", () => {
  it("shows tooltip content and preserves the wrapped control", () => {
    render(
      <CommonToolTip title="Explains the quota" open TransitionProps={{ timeout: 0 }}>
        <button type="button">Info</button>
      </CommonToolTip>,
    );

    expect(screen.getByRole("button", { name: "Explains the quota" })).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Explains the quota");
  });

  it("supports arrow tooltips for icon hints", () => {
    render(
      <CommonToolTip title="Copy bucket id" arrow open TransitionProps={{ timeout: 0 }}>
        <button type="button" aria-label="Copy">
          Copy
        </button>
      </CommonToolTip>,
    );

    expect(screen.getByRole("tooltip")).toHaveTextContent("Copy bucket id");
  });
});
