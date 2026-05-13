import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import { getGroundXServiceHealth, listGroundXHealth } from "./groundxHealthEntity";

describe("groundxHealthEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
  });

  it("lists service health and unwraps response data", async () => {
    const response = { health: [{ service: "search", status: "ok" }] };
    axiosMock.get.mockResolvedValueOnce({ data: response });

    await expect(listGroundXHealth()).resolves.toBe(response);

    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/health", expect.any(Object));
  });

  it("gets encoded service health and propagates failures", async () => {
    await getGroundXServiceHealth("ingest service");
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/health/ingest%20service", expect.any(Object));

    const error = { message: "rate limited", status: 429 };
    axiosMock.get.mockRejectedValueOnce(error);
    await expect(listGroundXHealth()).rejects.toBe(error);
  });
});
