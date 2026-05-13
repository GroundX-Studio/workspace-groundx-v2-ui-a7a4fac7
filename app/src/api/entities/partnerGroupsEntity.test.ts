import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import { createPartnerGroup, deletePartnerGroup, getPartnerGroup, listPartnerGroups, updatePartnerGroup } from "./partnerGroupsEntity";

describe("partnerGroupsEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("wraps Partner group endpoints", async () => {
    await createPartnerGroup({ name: "legal" });
    await listPartnerGroups();
    await getPartnerGroup(2);
    await updatePartnerGroup(2, { name: "renamed" });
    await deletePartnerGroup(2);

    expect(axiosMock.post).toHaveBeenCalledWith("/api/group", { group: { name: "legal" } }, expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/group", expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/group/2", expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith("/api/group/2", { group: { name: "renamed" } }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/group/2", expect.any(Object));
  });
});
