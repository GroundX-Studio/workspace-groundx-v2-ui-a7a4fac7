import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import {
  createGroundXBucket,
  deleteGroundXBucket,
  getGroundXBucket,
  listGroundXBuckets,
  updateGroundXBucket,
} from "./groundxBucketsEntity";

describe("groundxBucketsEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("lists buckets with pagination and optional request options", async () => {
    const controller = new AbortController();
    const response = { buckets: [{ bucketId: 1, name: "Docs" }], nextToken: "next" };
    axiosMock.get.mockResolvedValueOnce({ data: response });

    await expect(listGroundXBuckets({ n: 10, nextToken: "next" }, { signal: controller.signal })).resolves.toBe(
      response
    );

    expect(axiosMock.get).toHaveBeenCalledWith(
      "/api/v1/bucket",
      expect.objectContaining({
        params: { n: 10, nextToken: "next" },
        signal: controller.signal,
      })
    );
  });

  it("creates, gets, updates, and deletes buckets", async () => {
    await createGroundXBucket("docs");
    await getGroundXBucket(12);
    await updateGroundXBucket(12, "contracts");
    await deleteGroundXBucket(12);

    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/bucket", { name: "docs" }, expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/bucket/12", expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith("/api/v1/bucket/12", { newName: "contracts" }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/bucket/12", expect.any(Object));
  });
});
