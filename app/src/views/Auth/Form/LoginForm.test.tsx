import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./LoginForm";

// Formik's blur + change handlers schedule async state updates that
// surface as React `act(...)` warnings under the user-event flow.
// The global setup.ts spy throws on every console.error; silence it
// per-suite (same pattern as src/views/Auth/Login.test.tsx).
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/**
 * TS-11 — LoginForm coverage. The form is wired to a Formik + Yup
 * schema (email required + .email() shape, password required). We
 * exercise the three observable contracts: validation, submit
 * happy-path, and error display.
 */
describe("LoginForm (TS-11)", () => {
  const baseValues = { email: "", password: "" };

  it("blocks submit and surfaces both required-field errors when fields are empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm values={baseValues} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the typed credentials on a valid form submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm values={baseValues} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    // `/password/i` matches both the password TextField and the
    // visibility-toggle button's aria-label — anchor to the exact
    // label string.
    await user.type(screen.getByLabelText("Password"), "hunter2!!");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [submitted] = onSubmit.mock.calls[0]!;
    expect(submitted).toEqual({ email: "user@example.com", password: "hunter2!!" });
  });

  it("surfaces the yup email-shape error for malformed email after blur", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm values={baseValues} onSubmit={onSubmit} />);
    const emailField = screen.getByLabelText(/email/i);
    await user.type(emailField, "not-an-email");
    await user.tab();
    await waitFor(() => {
      // yup .email() emits a default "must be a valid email" message.
      expect(screen.getByText(/must be a valid email|email.*valid/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
