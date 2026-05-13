import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import {
  assignGroundXAccountWorkflow,
  assignGroundXWorkflowToResource,
  createGroundXWorkflow,
  deleteGroundXWorkflow,
  getGroundXAccountWorkflow,
  getGroundXWorkflow,
  listGroundXWorkflows,
  removeGroundXAccountWorkflow,
  removeGroundXWorkflowFromResource,
  updateGroundXWorkflow,
} from "./groundxWorkflowsEntity";

describe("groundxWorkflowsEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("wraps workflow CRUD endpoints with encoded ids", async () => {
    await listGroundXWorkflows();
    await createGroundXWorkflow({ name: "default" });
    await getGroundXWorkflow("workflow/a b");
    await updateGroundXWorkflow("workflow/a b", { chunkStrategy: "size" });
    await deleteGroundXWorkflow("workflow/a b");

    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/workflow", expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/workflow", { name: "default" }, expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/workflow/workflow%2Fa%20b", expect.any(Object));
    expect(axiosMock.put).toHaveBeenCalledWith("/api/v1/workflow/workflow%2Fa%20b", { chunkStrategy: "size" }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/workflow/workflow%2Fa%20b", expect.any(Object));
  });

  it("wraps account and resource workflow relationship endpoints", async () => {
    await getGroundXAccountWorkflow();
    await assignGroundXAccountWorkflow({ workflowId: "wf" });
    await removeGroundXAccountWorkflow();
    await assignGroundXWorkflowToResource("resource/1", { workflowId: "wf" });
    await removeGroundXWorkflowFromResource("resource/1");

    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/workflow/relationship", expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/workflow/relationship", { workflowId: "wf" }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/workflow/relationship", expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/workflow/relationship/resource%2F1", { workflowId: "wf" }, expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/workflow/relationship/resource%2F1", expect.any(Object));
  });
});
