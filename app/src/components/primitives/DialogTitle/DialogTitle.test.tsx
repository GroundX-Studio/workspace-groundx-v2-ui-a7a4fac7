import Dialog from "@mui/material/Dialog";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DialogTitle from "./DialogTitle";

function renderDialogTitle(onClose?: () => void) {
  render(
    <Dialog open>
      <DialogTitle onClose={onClose}>Invite team member</DialogTitle>
    </Dialog>,
  );
}

describe("DialogTitle", () => {
  it("renders the title as a heading", () => {
    renderDialogTitle();

    expect(screen.getByRole("heading", { name: "Invite team member" })).toBeInTheDocument();
  });

  it("renders a close button only when onClose is provided", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderDialogTitle(onClose);
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "close" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
