import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CommonCancelButton from "./CommonCancelButton";

describe("CommonCancelButton", () => {
  it("renders as a non-submitting secondary action by default", () => {
    render(<CommonCancelButton>Cancel</CommonCancelButton>);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("type", "button");
  });

  it("calls the provided click handler", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<CommonCancelButton onClick={onClick}>Cancel</CommonCancelButton>);
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Cancel" }));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
