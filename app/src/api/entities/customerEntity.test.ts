import rawAxios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appUserMetadataSchema, type AppUserMetadata as SharedAppUserMetadata } from "@groundx/shared";

import axios from "@/api/axios";
import {
  confirmUserChangingPassword,
  getUserData,
  login,
  logout,
  register,
  resetUserPassword,
  updateAppMetadata,
  type AppUserMetadata,
} from "@/api/entities/customerEntity";

/**
 * 2026-05-31-chat-wire-types-shared — `AppUserMetadata` was declared on BOTH
 * sides of the wire: the middleware persisted-record shape (7 fields) and the
 * app's documented SUBSET (`groundxUsername?` / `onboardingState?`). It is now
 * single-sourced on `@groundx/shared` with every session-metadata field OPTIONAL
 * except `groundxUsername`, so each side narrows from one source. This `Eq<>`
 * assert is load-bearing under `npm run build` (tsc): if the app re-forks the
 * shape, `Assert<false>` fails the build.
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertAppUserMetadata = Assert<Eq<AppUserMetadata, SharedAppUserMetadata>>;

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

  it("validates the app-metadata response against the shared appUserMetadataSchema", () => {
    // The app narrows to `groundxUsername` + `onboardingState`, but the shared
    // schema also accepts the middleware's superset fields (all optional).
    expect(appUserMetadataSchema.safeParse({ groundxUsername: "acct-1", onboardingState: "complete" }).success).toBe(true);
    expect(
      appUserMetadataSchema.safeParse({
        groundxUsername: "acct-1",
        onboardingState: null,
        uiPreferencesJson: "{}",
        featureFlagsJson: null,
        lastActiveProjectId: "proj-1",
        acceptedTermsAt: new Date().toISOString(),
        appRole: "owner",
      }).success,
    ).toBe(true);
    // `groundxUsername` is the one required field.
    expect(appUserMetadataSchema.safeParse({ onboardingState: "complete" }).success).toBe(false);
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
