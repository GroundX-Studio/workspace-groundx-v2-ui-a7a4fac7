import { afterEach, describe, expect, it, vi } from "vitest";

import { ScenarioRegistry } from "./registry.js";
import type { ScenarioManifest } from "./types.js";
import { testEnv } from "../test/fakes.js";

/**
 * 2026-05-31-core-data-followups §7j finding C — guard the registry lift at
 * `registry.ts:143`: `groupIntoScenarios` lifts a scenario's stored
 * `manifest.supportsJsonRender` onto the consumed `ScenarioConfig`. This is the
 * REAL production seam (the app fixtures set the config flag directly and never
 * exercise the bucket round-trip). The lift is private, so it is driven through
 * the public `list()` with a mocked GroundX documents-list `fetch`.
 */

const SAMPLES_BUCKET_ID = 28454;

const env = { ...testEnv, GROUNDX_SAMPLES_BUCKET_ID: SAMPLES_BUCKET_ID };

function manifest(id: string, supportsJsonRender?: boolean): ScenarioManifest {
  return {
    id,
    hero: {
      title: id,
      shortDesc: "",
      demonstrates: "",
      badges: [],
      chapters: { extract: "off", interact: "off", report: "off" },
      docCount: "1",
    },
    thinkingScript: [],
    chatSeeds: [],
    ...(supportsJsonRender === undefined ? {} : { supportsJsonRender }),
  };
}

/** A samples-bucket document carrying the canonical `sample-doc` filter. */
function sampleDoc(scenarioId: string, m: ScenarioManifest) {
  return {
    documentId: `doc-${scenarioId}`,
    fileName: `${scenarioId}.pdf`,
    bucketId: SAMPLES_BUCKET_ID,
    filter: {
      kind: "sample-doc",
      scenarioId,
      scenarioOrder: 1,
      scenarioRole: "doc",
      manifest: m,
    },
  };
}

function mockDocumentsList(docs: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ documents: docs }), { status: 200 }),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe("ScenarioRegistry — supportsJsonRender lift (finding C)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lifts manifest.supportsJsonRender:true onto config.supportsJsonRender", async () => {
    mockDocumentsList([sampleDoc("loan", manifest("loan", true))]);
    const scenarios = await new ScenarioRegistry(env).list();
    const loan = scenarios.find((s) => s.id === "loan");
    expect(loan).toBeDefined();
    expect(loan!.supportsJsonRender).toBe(true);
  });

  it("defaults config.supportsJsonRender to false when the manifest flag is absent", async () => {
    mockDocumentsList([sampleDoc("utility", manifest("utility" /* flag omitted */))]);
    const scenarios = await new ScenarioRegistry(env).list();
    const utility = scenarios.find((s) => s.id === "utility");
    expect(utility).toBeDefined();
    expect(utility!.supportsJsonRender).toBe(false);
  });

  it("preserves manifest.supportsJsonRender:false as config false", async () => {
    mockDocumentsList([sampleDoc("solar", manifest("solar", false))]);
    const scenarios = await new ScenarioRegistry(env).list();
    const solar = scenarios.find((s) => s.id === "solar");
    expect(solar).toBeDefined();
    expect(solar!.supportsJsonRender).toBe(false);
  });
});
