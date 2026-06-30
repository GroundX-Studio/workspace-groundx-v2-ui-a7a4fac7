import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmChangePasswordForm } from "./ConfirmChangePasswordForm";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/**
 * TS-11 — ConfirmChangePasswordForm coverage. 6-digit code + new
 * password (>=8 chars, at least 1 lowercase, <=32, latin symbols).
 */
describe("ConfirmChangePasswordForm (TS-11)", () => {
  const baseValues = { code: "", password: "" };

  it("blocks submit when both fields are empty and shows both errors", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConfirmChangePasswordForm values={baseValues} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => {
      expect(screen.getByText("Code is required")).toBeInTheDocument();
    });
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a code that isn't exactly 6 digits", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConfirmChangePasswordForm values={baseValues} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/code/i), "abc12");
    await user.type(screen.getByLabelText(/new password/i), "validpass1");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(screen.getByText(/Code must be exactly 6 digits/i)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit when code is 6 digits and password meets the schema", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConfirmChangePasswordForm values={baseValues} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/code/i), "123456");
    await user.type(screen.getByLabelText(/new password/i), "newpass99");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toEqual({ code: "123456", password: "newpass99" });
  });
});
