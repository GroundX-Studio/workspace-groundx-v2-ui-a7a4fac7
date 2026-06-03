import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

import { api } from "@/api";
import { Register } from "@/views/Auth/Register";
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
const user = { username: "acct-1", email: "pat@company.com", first: "Pat", last: "Lee" };

const encoded = (value: string) => btoa(value);

const renderRegisterRoute = (route = "/auth/register") =>
  renderWithAppProviders(
    <Routes>
      <Route path="/auth/register" element={<Register />} />
      <Route path="/home" element={<div>Home route</div>} />
    </Routes>,
    { initialRoute: route }
  );

const inviteRoute = (email: string) =>
  `/auth/register?fn=${encoded("Pat")}&ln=${encoded("Lee")}&e=${encoded(email)}&c=${encoded(
    "Example Co"
  )}&p=${encoded("password1")}`;

describe("Register screen", () => {
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("registers a business email, receives the cookie session, and navigates to home", async () => {
    mockedApi.register.mockResolvedValueOnce({ username: "acct-1", token: "token-1", xJwtToken: "jwt-1", apiKeys: [] });
    mockedApi.getUserData.mockResolvedValueOnce({ customer: user });

    renderRegisterRoute(inviteRoute("pat@company.com"));
    await screen.findByDisplayValue("pat@company.com");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await expect(screen.findByText("Home route", undefined, { timeout: 10000 })).resolves.toBeInTheDocument();
    expect(mockedApi.register).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Example Co",
        email: "pat@company.com",
        endUserLicenseAgreement: true,
      })
    );
    expect(sessionStorage.getItem("n")).toBeNull();
  });

  it("disables submit during registration so duplicate clicks do not send duplicate requests", async () => {
    mockedApi.register.mockReturnValueOnce(new Promise(() => undefined) as any);

    renderRegisterRoute(inviteRoute("pat@company.com"));
    await screen.findByDisplayValue("pat@company.com");
    const submit = screen.getByRole("button", { name: /register/i });
    fireEvent.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);
    expect(mockedApi.register).toHaveBeenCalledTimes(1);
  });

  it("blocks personal email domains before calling the registration API", async () => {
    renderRegisterRoute(inviteRoute("pat@gmail.com"));
    await screen.findByDisplayValue("pat@gmail.com");
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await expect(screen.findByText("Please enter a business email address.")).resolves.toBeInTheDocument();
    expect(mockedApi.register).not.toHaveBeenCalled();
  });

  it("pre-fills invite query params and x-ray demo email", async () => {
    localStorage.setItem("x-ray-demo-email", "demo@company.com");
    renderRegisterRoute(
      `/auth/register?fn=${encoded("Ada")}&ln=${encoded("Lovelace")}&c=${encoded("Analytical Engines")}&p=${encoded(
        "password1"
      )}`
    );

    expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lovelace")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Analytical Engines")).toBeInTheDocument();
    expect(screen.getByDisplayValue("demo@company.com")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("renders the app-configured terms link instead of a product-specific hardcoded URL", async () => {
    renderRegisterRoute();

    expect(await screen.findByRole("link", { name: /end user license agreement/i })).toHaveAttribute(
      "href",
      "https://www.eyelevel.ai/product/terms-conditions"
    );
  });
});
