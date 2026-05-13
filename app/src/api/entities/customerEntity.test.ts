import rawAxios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import axios from "@/api/axios";
import {
  confirmUserChangingPassword,
  getUserData,
  login,
  logout,
  register,
  resetUserPassword,
  updateAppMetadata,
} from "@/api/entities/customerEntity";

vi.mock("@/api/axios", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

const mockedRawAxiosPost = vi.mocked(rawAxios.post);
const mockedAxiosGet = vi.mocked(axios.get);
const mockedAxiosPatch = vi.mocked(axios.patch);
const mockedAxiosPost = vi.mocked(axios.post);

describe("customerEntity", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs in with Basic auth and returns the JWT response header", async () => {
    mockedRawAxiosPost.mockResolvedValueOnce({
      data: { customer: { email: "pat@example.com" }, token: "token-1", username: "acct-1" },
      headers: { "x-jwt-token": "jwt-1" },
    });

    const response = await login({ email: "pat@example.com", password: "secret" });

    expect(mockedRawAxiosPost).toHaveBeenCalledWith("/api/auth/login", undefined, {
      headers: expect.objectContaining({
        Accept: "application/json",
        Authorization: `Basic ${btoa("pat@example.com:secret")}`,
        "Content-Type": "application/json",
      }),
      withCredentials: true,
    });
    expect(response).toMatchObject({ username: "acct-1", token: "token-1", xJwtToken: "jwt-1" });
  });

  it("registers with the customer payload and returns the JWT response header", async () => {
    mockedRawAxiosPost.mockResolvedValueOnce({
      data: { username: "acct-2", token: "token-2", apiKeys: [] },
      headers: { "x-jwt-token": "jwt-2" },
    });

    const payload = {
      first: "Pat",
      last: "Lee",
      email: "pat@company.com",
      password: "secret",
      confirmPassword: "secret",
      companyName: "Company",
      endUserLicenseAgreement: true,
      xrayEmail: null,
    };

    const response = await register(payload);

    expect(mockedRawAxiosPost).toHaveBeenCalledWith(
      "/api/auth/register",
      { customer: payload },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa("pat@company.com:secret")}`,
        }),
        withCredentials: true,
      })
    );
    expect(response).toMatchObject({ username: "acct-2", token: "token-2", xJwtToken: "jwt-2" });
  });

  it("loads customer data through the configured axios client", async () => {
    mockedAxiosGet.mockResolvedValueOnce({
      data: { customer: { username: "acct-1", email: "pat@example.com", first: "Pat", last: "Lee" } },
    });

    await expect(getUserData("acct-1")).resolves.toMatchObject({
      customer: { email: "pat@example.com", username: "acct-1" },
    });
    expect(mockedAxiosGet).toHaveBeenCalledWith("/api/auth/me");
  });

  it("requests and confirms password reset through unauthenticated endpoints", async () => {
    mockedRawAxiosPost.mockResolvedValueOnce({ data: { message: "OK" } });
    mockedRawAxiosPost.mockResolvedValueOnce({ data: { message: "OK" } });

    await expect(resetUserPassword("pat@example.com")).resolves.toEqual({ message: "OK" });
    await expect(confirmUserChangingPassword("123456", "pat@example.com", "new-pass")).resolves.toEqual({
      message: "OK",
    });

    expect(mockedRawAxiosPost).toHaveBeenNthCalledWith(
      1,
      "/api/auth/password/reset",
      { email: "pat@example.com" },
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }), withCredentials: true })
    );
    expect(mockedRawAxiosPost).toHaveBeenNthCalledWith(
      2,
      "/api/auth/password/confirm",
      { email: "pat@example.com", newPassword: "new-pass", code: "123456" },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Basic ${btoa("pat@example.com:new-pass")}` }),
        withCredentials: true,
      })
    );
  });

  it("logs out through the configured axios client so the cookie can be cleared", async () => {
    mockedAxiosPost.mockResolvedValueOnce({ data: { success: true } });

    await expect(logout()).resolves.toEqual({ success: true });

    expect(mockedAxiosPost).toHaveBeenCalledWith("/api/auth/logout");
  });

  it("updates app-owned metadata through the same-origin middleware session", async () => {
    mockedAxiosPatch.mockResolvedValueOnce({
      data: { appMetadata: { groundxUsername: "acct-1", onboardingState: "complete" } },
    });

    await expect(updateAppMetadata({ onboardingState: "complete" })).resolves.toEqual({
      groundxUsername: "acct-1",
      onboardingState: "complete",
    });

    expect(mockedAxiosPatch).toHaveBeenCalledWith("/api/me/metadata", { onboardingState: "complete" });
  });
});
