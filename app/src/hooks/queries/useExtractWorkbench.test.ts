import { describe, it, expect, vi } from "vitest";

import { loadExtractWorkbench } from "./useExtractWorkbench";

/**
 * analyze-and-chat-ux §1.4 — the workbench load produces an INSTANCE tree
 * (output-first) with geometry keyed by instance PATH, so two meters' same
 * field carry their own values and their own highlight regions (no `[0]`
 * flatten). The pure loader is tested with fakes at the SDK seam — the same
 * seams the `useQuery` hook injects.
 */

const workflow = {
  workflowId: "wf-1",
  name: "Utility Bill",
  extract: {
    statement: {
      fields: {
        bill_account_id: { prompt: { description: "account id", type: "str" } },
      },
    },
    meters: {
      fields: {
        meter_id: { prompt: { description: "meter id", type: "str" } },
        usage_amount: { prompt: { description: "usage", type: ["int", "float"] } },
      },
    },
    charges: {
      fields: {
        line_amount: { prompt: { description: "charge amount", type: ["int", "float"] } },
        line_currency: { prompt: { description: "currency", type: "str" } },
      },
    },
  },
};

const output = {
  bill_account_id: "10295809",
  internal_noise: "hidden-by-schema-join", // no schema field → hidden
  account_charges: [],
  meters: [
    {
      meter_id: "M-1",
      usage_amount: 60960,
      meter_charges: [
        { line_amount: 55, line_currency: "USD" },
        { line_amount: 12.5, line_currency: "USD" },
      ],
    },
    { meter_id: "M-2", usage_amount: 900, meter_charges: [] },
  ],
};

function makeDeps() {
  const fetchFieldGeometry = vi.fn(
    async (_docId: string, queries: Array<{ value: unknown; label?: string }>) =>
      // Geometry derived from the VALUE, so distinct values → distinct regions.
      queries.map((q) => [
        { page: 1, bbox: { x: 0.1, y: Number(String(q.value).length) / 100, w: 0.2, h: 0.02 } },
      ]),
  );
  return {
    getDocument: vi.fn(async () => ({
      isSuccess: true,
      response: { filter: { workflow_id: "wf-1" } },
    })),
    getDocumentExtract: vi.fn(async () => ({ isSuccess: true, response: output })),
    getWorkflow: vi.fn(async () => ({ workflow })),
    fetchFieldGeometry,
  };
}

describe("loadExtractWorkbench — instance tree + per-path geometry (§1.4)", () => {
  it("returns the instance tree: root scalars + all meter instances + nested charges", async () => {
    const data = await loadExtractWorkbench("doc-1", makeDeps());
    expect(data.schema?.name).toBe("Utility Bill");
    expect(data.root?.fields.bill_account_id.value).toBe("10295809");
    expect(data.root?.groups.meters).toHaveLength(2);
    expect(data.root?.groups.meters[0].groups.meter_charges).toHaveLength(2);
    // hiding rule applied (schema join)
    expect(data.root && "internal_noise" in data.root.fields).toBe(false);
  });

  it("keys geometry by INSTANCE PATH — two meters' same field get distinct regions", async () => {
    const data = await loadExtractWorkbench("doc-1", makeDeps());
    const g0 = data.geometry.get("meters/0/usage_amount");
    const g1 = data.geometry.get("meters/1/usage_amount");
    expect(g0).toBeDefined();
    expect(g1).toBeDefined();
    // value-derived fake: 60960 (5 chars) vs 900 (3 chars) → different bboxes
    expect(g0![0].bbox.y).not.toBe(g1![0].bbox.y);
  });

  it("dedupes identical (value,label) geometry queries — repeated currency asks once", async () => {
    const deps = makeDeps();
    await loadExtractWorkbench("doc-1", deps);
    const queries = deps.fetchFieldGeometry.mock.calls[0][1] as Array<{ value: unknown; label?: string }>;
    const currencyQueries = queries.filter((q) => q.value === "USD");
    expect(currencyQueries).toHaveLength(1); // 2 instances, 1 query
    // ...but BOTH instance paths resolve to regions
    const data = await loadExtractWorkbench("doc-1", makeDeps());
    expect(data.geometry.get("meters/0/meter_charges/0/line_currency")).toBeDefined();
    expect(data.geometry.get("meters/0/meter_charges/1/line_currency")).toBeDefined();
  });

  it("skips geometry for null values", async () => {
    const base = makeDeps();
    const deps = {
      ...base,
      getDocumentExtract: vi.fn(async () => ({
        isSuccess: true,
        response: { bill_account_id: null, meters: [] } as Record<string, unknown>,
      })),
    };
    const data = await loadExtractWorkbench("doc-1", deps);
    expect(base.fetchFieldGeometry.mock.calls[0]?.[1] ?? []).toHaveLength(0);
    expect(data.geometry.size).toBe(0);
  });

  it("no workflow id → empty result", async () => {
    const deps = {
      ...makeDeps(),
      getDocument: vi.fn(async () => ({ isSuccess: true, response: { filter: {} as Record<string, unknown> } })),
    };
    const data = await loadExtractWorkbench("doc-1", deps);
    expect(data.schema).toBeNull();
    expect(data.root).toBeNull();
  });
});
