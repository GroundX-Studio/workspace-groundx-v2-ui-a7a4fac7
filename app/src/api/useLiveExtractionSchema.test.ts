import { describe, expect, it, vi } from "vitest";

import { fetchLiveSchema } from "./useLiveExtractionSchema";

// Minimal real-shaped workflow (9910308e vocab): statement → addressee.
const workflow = {
  workflow: {
    workflowId: "wf-1",
    name: "Utility Bill",
    extract: {
      statement: { fields: { addressee: { prompt: { description: "recipient", type: "str" } } } },
      meters: { fields: { usage_amount: { prompt: { description: "usage", type: ["int", "float"] } } } },
      charges: { fields: { line_amount: { prompt: { description: "charge", type: ["int", "float"] } } } },
    },
  },
};

function fakeGetDocument(filter: Record<string, unknown> | undefined) {
  return vi.fn().mockResolvedValue({ isSuccess: true, response: filter ? { filter } : {}, error: null });
}

function fakeGetWorkflow() {
  return vi.fn().mockResolvedValue(workflow);
}

describe("fetchLiveSchema (WF-17)", () => {
  it("resolves documentId → filter.workflow_id → workflow → schema", async () => {
    const getDoc = fakeGetDocument({ workflow_id: "9910308e" });
    const getWorkflow = fakeGetWorkflow();

    const schema = await fetchLiveSchema("c3bfff49-6640-4213-822b-e81c3a771e45", getDoc as never, getWorkflow as never);

    expect(getDoc).toHaveBeenCalledWith("c3bfff49-6640-4213-822b-e81c3a771e45");
    expect(getWorkflow).toHaveBeenCalledWith("9910308e");
    expect(schema?.categories.map((c) => c.type)).toEqual(["statement", "meters", "charges"]);
    expect(schema?.categories.find((c) => c.type === "statement")?.fields[0].id).toBe("addressee");
  });

  it("returns null when the doc has no workflow_id", async () => {
    const getDoc = fakeGetDocument(undefined);
    const getWorkflow = fakeGetWorkflow();
    const schema = await fetchLiveSchema("c3bfff49-6640-4213-822b-e81c3a771e45", getDoc as never, getWorkflow as never);
    expect(schema).toBeNull();
    expect(getWorkflow).not.toHaveBeenCalled();
  });
});
