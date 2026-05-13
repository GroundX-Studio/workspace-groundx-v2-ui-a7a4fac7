import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import {
  createGroundXApiKey,
  deleteGroundXApiKey,
  listGroundXApiKeys,
  renameGroundXApiKey,
} from "./groundxApiKeysEntity";

describe("groundxApiKeysEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: { apiKeys: [] } });
    axiosMock.post.mockResolvedValue({ data: { apiKeys: [] } });
    axiosMock.put.mockResolvedValue({ data: { apiKeys: [] } });
    axiosMock.delete.mockResolvedValue({ data: { message: "OK" } });
  });

  it("lists API keys through the same-origin middleware session", async () => {
    const response = { apiKeys: [{ apiKey: "gx", name: "Prod" }] };
    axiosMock.get.mockResolvedValueOnce({ data: response });

    await expect(listGroundXApiKeys()).resolves.toBe(response);

    expect(axiosMock.get).toHaveBeenCalledWith(
      "/api/v1/apikey",
      expect.not.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("creates, renames, and deletes API keys with encoded key path params", async () => {
    await createGroundXApiKey("prod");
    await renameGroundXApiKey("key/1", "renamed");
    await deleteGroundXApiKey("key/1");

    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/apikey", { name: "prod" }, expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith(
      "/api/v1/apikey/key%2F1",
      { name: "renamed" },
      expect.any(Object)
    );
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/apikey/key%2F1", expect.any(Object));
  });

  it("propagates request errors", async () => {
    const error = { message: "Forbidden", status: 403 };
    axiosMock.get.mockRejectedValueOnce(error);

    await expect(listGroundXApiKeys()).rejects.toBe(error);
  });
});
