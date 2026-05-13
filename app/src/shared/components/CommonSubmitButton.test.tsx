import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CommonSubmitButton from "./CommonSubmitButton";

describe("CommonSubmitButton", () => {
  it("defaults to a non-submitting primary button", () => {
    render(<CommonSubmitButton>Save</CommonSubmitButton>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("allows explicit submit semantics for forms", () => {
    render(<CommonSubmitButton type="submit">Send Invite</CommonSubmitButton>);

    expect(screen.getByRole("button", { name: "Send Invite" })).toHaveAttribute("type", "submit");
  });

  it("calls the provided click handler", () => {
    const onClick = vi.fn();

    render(<CommonSubmitButton onClick={onClick}>Create</CommonSubmitButton>);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("honors disabled state", () => {
    render(<CommonSubmitButton disabled>Saving</CommonSubmitButton>);

    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
  });
});
