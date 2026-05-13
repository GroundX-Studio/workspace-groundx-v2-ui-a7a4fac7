import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

import { api } from "@/api";
import { ResetPassword } from "@/views/Auth/ResetPassword";
import { renderWithAppProviders } from "@/test/renderWithAppProviders";

vi.mock("@/api", () => ({
  api: {
    confirmUserChangingPassword: vi.fn(),
    getUserData: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    resetUserPassword: vi.fn(),
    updateAppMetadata: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const renderResetPasswordRoute = () =>
  renderWithAppProviders(
    <Routes>
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/login" element={<div>Login route</div>} />
    </Routes>,
    "/auth/reset-password"
  );

describe("ResetPassword screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("sends a reset code, resends it, and confirms a new password", async () => {
    mockedApi.resetUserPassword.mockResolvedValue({ message: "OK" });
    mockedApi.confirmUserChangingPassword.mockResolvedValueOnce({ message: "OK" });

    renderResetPasswordRoute();
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

    expect(mockedApi.resetUserPassword).toHaveBeenCalledWith("pat@example.com");
    expect(mockedApi.resetUserPassword).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(mockedApi.confirmUserChangingPassword).toHaveBeenCalledWith("123456", "pat@example.com", "password1")
    );
  });
});
