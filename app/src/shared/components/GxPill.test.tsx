import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GxPill from "./GxPill";

describe("GxPill", () => {
  it("renders a non-interactive status label by default", () => {
    render(<GxPill>READY</GxPill>);

    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("becomes an accessible control when onClick is provided", () => {
    const onClick = vi.fn();
    render(<GxPill onClick={onClick}>SOURCE 1</GxPill>);

    fireEvent.click(screen.getByRole("button", { name: "SOURCE 1" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
