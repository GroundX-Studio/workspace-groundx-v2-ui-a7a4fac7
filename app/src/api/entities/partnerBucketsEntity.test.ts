import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import {
  createPartnerBucket,
  deletePartnerBucket,
  getPartnerBucket,
  listPartnerBuckets,
  transferPartnerBucket,
  updatePartnerBucket,
} from "./partnerBucketsEntity";

describe("partnerBucketsEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("wraps Partner bucket endpoints", async () => {
    await createPartnerBucket({ name: "docs" });
    await listPartnerBuckets();
    await getPartnerBucket(1);
    await updatePartnerBucket(1, { name: "renamed" });
    await deletePartnerBucket(1);
    await transferPartnerBucket(1);

    expect(axiosMock.post).toHaveBeenCalledWith("/api/bucket", { bucket: { name: "docs" } }, expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/bucket", expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/bucket/1", expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith("/api/bucket/1", { bucket: { name: "renamed" } }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/bucket/1", expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/bucket/transfer/1", undefined, expect.any(Object));
  });
});
