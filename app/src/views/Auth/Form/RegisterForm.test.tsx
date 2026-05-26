import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "./RegisterForm";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/**
 * TS-11 — RegisterForm coverage. The schema is the strictest of the
 * five auth forms: first/last/email/password/confirmPassword/EULA
 * are required, latin-symbol regex on names + password, password
 * length 8–32 with at least one lowercase, and confirmPassword must
 * match password.
 */
describe("RegisterForm (TS-11)", () => {
  const baseValues = {
    first: "",
    last: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    endUserLicenseAgreement: false,
    xrayEmail: null,
  };

  it("blocks submit when all required fields are empty and surfaces every required-field error", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RegisterForm values={baseValues} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /register/i }));
    await waitFor(() => {
      expect(screen.getByText("First Name is required")).toBeInTheDocument();
    });
    expect(screen.getByText("Last Name is required")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(screen.getByText("You must accept the terms and conditions")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects when password and confirmPassword do not match", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RegisterForm values={baseValues} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/first name/i), "Pat");
    await user.type(screen.getByLabelText(/last name/i), "Lee");
    await user.type(screen.getByLabelText(/^email/i), "pat@example.com");
    await user.type(screen.getByLabelText(/^password/i), "validpw99");
    await user.type(screen.getByLabelText(/confirm password/i), "different11");
    await user.click(screen.getByLabelText(/end user license agreement/i));
    await user.click(screen.getByRole("button", { name: /register/i }));
    await waitFor(() => expect(screen.getByText("Passwords do not match")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the filled values when the entire schema passes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RegisterForm values={baseValues} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/first name/i), "Pat");
    await user.type(screen.getByLabelText(/last name/i), "Lee");
    await user.type(screen.getByLabelText(/^email/i), "pat@example.com");
    await user.type(screen.getByLabelText(/^password/i), "validpw99");
    await user.type(screen.getByLabelText(/confirm password/i), "validpw99");
    await user.click(screen.getByLabelText(/end user license agreement/i));
    await user.click(screen.getByRole("button", { name: /register/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0]![0];
    expect(submitted.email).toBe("pat@example.com");
    expect(submitted.first).toBe("Pat");
    expect(submitted.last).toBe("Lee");
    expect(submitted.password).toBe("validpw99");
    expect(submitted.confirmPassword).toBe("validpw99");
    expect(submitted.endUserLicenseAgreement).toBe(true);
  });
});
