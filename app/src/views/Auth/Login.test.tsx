import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

import { api } from "@/api";
import { Login } from "@/views/Auth/Login";
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
const user = { username: "acct-1", email: "pat@example.com", first: "Pat", last: "Lee" };

const renderLoginRoute = () =>
  renderWithAppProviders(
    <Routes>
      <Route path="/auth/login" element={<Login />} />
      <Route path="/home" element={<div>Home route</div>} />
      <Route path="/auth/reset-password" element={<div>Reset route</div>} />
    </Routes>,
    { initialRoute: "/auth/login" }
  );

describe("Login screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("submits credentials, receives the cookie session, and navigates to the protected home route", async () => {
    mockedApi.login.mockResolvedValueOnce({ username: "acct-1", token: "token-1", xJwtToken: "jwt-1", customer: user });
    mockedApi.getUserData.mockResolvedValueOnce({ customer: user });

    renderLoginRoute();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await expect(screen.findByText("Home route")).resolves.toBeInTheDocument();
    expect(mockedApi.login).toHaveBeenCalledWith({ email: "pat@example.com", password: "secret" });
    expect(sessionStorage.getItem("n")).toBeNull();
    expect(sessionStorage.getItem("t")).toBeNull();
    expect(sessionStorage.getItem("j")).toBeNull();
  });

  it("disables submit during login so duplicate clicks do not send duplicate requests", async () => {
    mockedApi.login.mockReturnValueOnce(new Promise(() => undefined) as any);

    renderLoginRoute();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    const submit = screen.getByRole("button", { name: /continue/i });
    fireEvent.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);
    expect(mockedApi.login).toHaveBeenCalledTimes(1);
  });

  it("shows a message and resets fields when login fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedApi.login.mockRejectedValueOnce(new Error("Unauthorized"));

    renderLoginRoute();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bad-password" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue(""));
    expect(screen.getByLabelText("Password")).toHaveValue("");
    consoleError.mockRestore();
  });

  it("routes to password reset from the forgot-password action", async () => {
    renderLoginRoute();

    fireEvent.click(screen.getByRole("button", { name: /forgot your password/i }));

    await expect(screen.findByText("Reset route")).resolves.toBeInTheDocument();
  });
});
