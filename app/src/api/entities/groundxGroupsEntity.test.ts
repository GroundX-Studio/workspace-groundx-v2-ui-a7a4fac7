import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import {
  addBucketToGroundXGroup,
  createGroundXGroup,
  deleteGroundXGroup,
  getGroundXGroup,
  listGroundXGroups,
  removeBucketFromGroundXGroup,
  updateGroundXGroup,
} from "./groundxGroupsEntity";

describe("groundxGroupsEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("lists groups with pagination", async () => {
    await listGroundXGroups({ n: 5, nextToken: "next" });

    expect(axiosMock.get).toHaveBeenCalledWith(
      "/api/v1/group",
      expect.objectContaining({ params: { n: 5, nextToken: "next" } })
    );
  });

  it("creates, gets, updates, deletes, and manages bucket membership", async () => {
    await createGroundXGroup({ name: "legal", bucketName: "contracts" });
    await getGroundXGroup(1);
    await updateGroundXGroup(1, "contracts");
    await deleteGroundXGroup(1);
    await addBucketToGroundXGroup(1, 2);
    await removeBucketFromGroundXGroup(1, 2);

    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/group", { name: "legal", bucketName: "contracts" }, expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/group/1", expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith("/api/v1/group/1", { newName: "contracts" }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/group/1", expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/group/1/bucket/2", undefined, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/group/1/bucket/2", expect.any(Object));
  });
});
