import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import {
  attachBucketToPartnerProject,
  createPartnerProject,
  detachBucketFromPartnerProject,
  listPartnerProjects,
  updatePartnerProject,
} from "./partnerProjectsEntity";

describe("partnerProjectsEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("wraps Partner project CRUD-like endpoints", async () => {
    await createPartnerProject({ project: { name: "app" }, bucket: { name: "docs" } });
    await listPartnerProjects();
    await updatePartnerProject(3, { name: "renamed" });

    expect(axiosMock.post).toHaveBeenCalledWith("/api/project", { project: { name: "app" }, bucket: { name: "docs" } }, expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/project", expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith("/api/project/3", { project: { name: "renamed" } }, expect.any(Object));
  });

  it("wraps Partner project bucket relationship endpoints", async () => {
    await attachBucketToPartnerProject(3, 1);
    await detachBucketFromPartnerProject(3, 1);

    expect(axiosMock.post).toHaveBeenCalledWith("/api/project/kit/3", { project: { bucketId: 1 } }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/project/kit/3", expect.objectContaining({ data: { project: { bucketId: 1 } } }));
  });
});
