import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMocks = vi.hoisted(() => ({
  configured: {
    get: vi.fn(),
    delete: vi.fn(),
  },
  raw: {
    post: vi.fn(),
  },
}));

vi.mock("@/api/axios", () => ({ default: axiosMocks.configured }));
vi.mock("axios", () => ({ default: axiosMocks.raw }));

import {
  confirmPartnerCustomerPassword,
  deletePartnerCustomer,
  getPartnerCustomer,
  loginPartnerCustomer,
  registerPartnerCustomer,
  resetPartnerCustomerPassword,
} from "./partnerCustomerEntity";

describe("partnerCustomerEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMocks.configured.get.mockResolvedValue({ data: {} });
    axiosMocks.configured.delete.mockResolvedValue({ data: {} });
    axiosMocks.raw.post.mockResolvedValue({ data: {}, headers: {} });
  });

  it("registers and logs in through public middleware auth endpoints with Basic auth and cookies", async () => {
    axiosMocks.raw.post.mockResolvedValueOnce({
      data: { token: "token", username: "user" },
      headers: { "x-jwt-token": "jwt-token" },
    });

    await expect(registerPartnerCustomer({ email: "a@example.com", password: "pw" }, { first: "A" })).resolves.toEqual({
      token: "token",
      username: "user",
      xJwtToken: "jwt-token",
    });
    await loginPartnerCustomer({ email: "a@example.com", password: "pw" });

    expect(axiosMocks.raw.post).toHaveBeenCalledWith(
      "/api/auth/register",
      { customer: { first: "A" } },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
        withCredentials: true,
      })
    );
    expect(axiosMocks.raw.post).toHaveBeenCalledWith(
      "/api/auth/login",
      undefined,
      expect.objectContaining({ withCredentials: true })
    );
  });

  it("gets and deletes customers through protected Partner proxy endpoints", async () => {
    await getPartnerCustomer("account/email@example.com");
    await deletePartnerCustomer("account/email@example.com");

    expect(axiosMocks.configured.get).toHaveBeenCalledWith("/api/customer/account%2Femail%40example.com", expect.any(Object));
    expect(axiosMocks.configured.delete).toHaveBeenCalledWith("/api/customer/account%2Femail%40example.com", expect.any(Object));
  });

  it("resets and confirms passwords through public middleware auth endpoints", async () => {
    await resetPartnerCustomerPassword("a@example.com");
    await confirmPartnerCustomerPassword({ email: "a@example.com", password: "pw2", code: "123456" });

    expect(axiosMocks.raw.post).toHaveBeenCalledWith(
      "/api/auth/password/reset",
      { email: "a@example.com" },
      expect.objectContaining({ withCredentials: true })
    );
    expect(axiosMocks.raw.post).toHaveBeenCalledWith(
      "/api/auth/password/confirm",
      { email: "a@example.com", newPassword: "pw2", code: "123456" },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
        withCredentials: true,
      })
    );
  });
});
