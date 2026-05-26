import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import TextField from "./TextField";

describe("TextField", () => {
  it("renders an accessible labelled input", () => {
    render(<TextField label="Email" />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("accepts user input", async () => {
    const user = userEvent.setup();

    render(<TextField label="Full name" />);
    await act(async () => {
      await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    });

    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
  });

  it("renders helper text and invalid state", () => {
    render(<TextField label="Email" error helperText="Email is required" />);

    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
