import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

import { ResetPassword } from "@/views/Auth/ResetPassword";
import { renderWithAppProviders } from "@/test/renderWithAppProviders";
import type { ApiOverrides } from "@/test/makeFakeApi";

const renderResetPasswordRoute = (api?: ApiOverrides) =>
  renderWithAppProviders(
    <Routes>
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/login" element={<div>Login route</div>} />
    </Routes>,
    { initialRoute: "/auth/reset-password", api }
  );

describe("ResetPassword screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("sends a reset code, resends it, and confirms a new password", async () => {
    const resetUserPassword = vi.fn().mockResolvedValue({ message: "OK" });
    const confirmUserChangingPassword = vi.fn().mockResolvedValueOnce({ message: "OK" });

    renderResetPasswordRoute({ auth: { resetUserPassword, confirmUserChangingPassword } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    });

    await expect(screen.findByText("RESET YOUR PASSWORD")).resolves.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resend code/i }));
    expect(await screen.findByText("Verification code successfully resent")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("Enter your new password"), { target: { value: "password1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    });

    expect(resetUserPassword).toHaveBeenCalledWith("pat@example.com");
    expect(resetUserPassword).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(confirmUserChangingPassword).toHaveBeenCalledWith("123456", "pat@example.com", "password1")
    );
  });
});
