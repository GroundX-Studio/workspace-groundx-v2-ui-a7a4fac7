import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchLiveExtract } from "./useLiveExtract";

vi.mock("@/api/entities/groundxWorkflowsEntity", () => ({
  getGroundXWorkflow: vi.fn(),
}));

import { getGroundXWorkflow } from "@/api/entities/groundxWorkflowsEntity";

afterEach(() => {
  vi.mocked(getGroundXWorkflow).mockReset();
});

// Real-shaped workflow + extract (9910308e vocab): statement scalar + a
// meters array whose first row carries the metered field.
const workflow = {
  workflow: {
    workflowId: "wf-1",
    name: "Utility Bill",
    extract: {
      statement: { fields: { addressee: { prompt: { description: "recipient", type: "str" } } } },
      meters: { fields: { usage_amount: { prompt: { description: "usage", type: ["int", "float"] } } } },
    },
  },
};

function fakeGetDocument(filter: Record<string, unknown> | undefined) {
  return vi.fn().mockResolvedValue({ isSuccess: true, response: filter ? { filter } : {}, error: null });
}

function fakeGetExtract(extract: Record<string, unknown> | null) {
  return vi.fn().mockResolvedValue({ isSuccess: extract != null, response: extract, error: null });
}

describe("fetchLiveExtract (2026-05-31-schemaview-live-only-extract)", () => {
  it("resolves documentId → workflow schema + extract values", async () => {
    vi.mocked(getGroundXWorkflow).mockResolvedValue(workflow as never);
    const getDoc = fakeGetDocument({ workflow_id: "9910308e" });
    const getExtract = fakeGetExtract({ addressee: "Jane Doe", meters: [{ usage_amount: 4128 }] });

    const live = await fetchLiveExtract("c3bfff49", getDoc as never, getExtract as never);

    expect(getDoc).toHaveBeenCalledWith("c3bfff49");
    expect(getGroundXWorkflow).toHaveBeenCalledWith("9910308e");
    expect(live.schema?.categories.map((c) => c.type)).toEqual(["statement", "meters"]);
    // Values flow from the extract response keyed by field id.
    const byId = new Map(live.values.map((v) => [v.fieldId, v.value]));
    expect(byId.get("addressee")).toBe("Jane Doe");
    expect(byId.get("usage_amount")).toBe(4128);
  });

  it("returns the empty extract when the doc has no workflow_id", async () => {
    const getDoc = fakeGetDocument(undefined);
    const getExtract = fakeGetExtract({ addressee: "x" });

    const live = await fetchLiveExtract("c3bfff49", getDoc as never, getExtract as never);

    expect(live).toEqual({ schema: null, values: [] });
    expect(getGroundXWorkflow).not.toHaveBeenCalled();
  });

  it("returns schema with no values when the extract response is empty", async () => {
    vi.mocked(getGroundXWorkflow).mockResolvedValue(workflow as never);
    const getDoc = fakeGetDocument({ workflow_id: "9910308e" });
    const getExtract = fakeGetExtract(null);

    const live = await fetchLiveExtract("c3bfff49", getDoc as never, getExtract as never);

    expect(live.schema).not.toBeNull();
    expect(live.values).toEqual([]);
  });
});
