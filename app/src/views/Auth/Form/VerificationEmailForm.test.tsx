import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VerificationEmailForm } from "./VerificationEmailForm";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/**
 * TS-11 — VerificationEmailForm coverage. Single email field + submit.
 */
describe("VerificationEmailForm (TS-11)", () => {
  const baseValues = { email: "" };

  it("blocks submit and surfaces the required-email error when empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<VerificationEmailForm values={baseValues} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(screen.getByText("Email is required")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the typed email on a valid form submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<VerificationEmailForm values={baseValues} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toEqual({ email: "user@example.com" });
  });

  it("rejects malformed email and shows the yup .email() error after blur", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<VerificationEmailForm values={baseValues} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/email/i), "bogus@@");
    await user.tab();
    await waitFor(() => expect(screen.getByText(/must be a valid email|email.*valid/i)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
