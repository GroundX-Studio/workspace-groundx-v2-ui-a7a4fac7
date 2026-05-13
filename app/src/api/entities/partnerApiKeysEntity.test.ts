import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import { createPartnerApiKey, deletePartnerApiKey, listPartnerApiKeys, renamePartnerApiKey } from "./partnerApiKeysEntity";

describe("partnerApiKeysEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("wraps Partner API key endpoints through the same-origin middleware session", async () => {
    await listPartnerApiKeys();
    await createPartnerApiKey("prod");
    await renamePartnerApiKey("key/1", "new");
    await deletePartnerApiKey("key/1");

    expect(axiosMock.get).toHaveBeenCalledWith(
      "/api/apikey",
      expect.not.objectContaining({ headers: expect.any(Object) })
    );
    expect(axiosMock.post).toHaveBeenCalledWith("/api/apikey", { apiKey: { name: "prod" } }, expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith("/api/apikey/key%2F1", { apiKey: { name: "new" } }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/apikey/key%2F1", expect.any(Object));
  });
});
