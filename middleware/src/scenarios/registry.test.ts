import { afterEach, describe, expect, it, vi } from "vitest";

import { ScenarioRegistry } from "./registry.js";
import type { SampleScenarioConfig } from "./sampleScenarios.js";
import type { ScenarioManifest } from "./types.js";
import { SAMPLE_PROJECT_ID } from "../db/seedSampleProject.js";
import { testEnv } from "../test/fakes.js";

/**
 * 2026-06-02-flatten-document-filter — the registry now reads manifests from the
 * APP-SIDE config (injected here) and joins bucket documents to a scenario by
 * `filter.projectId` ONLY (the flat scoping key); it no longer reads
 * `manifest`/`scenarioId` off the GroundX doc filter. Tests inject configs +
 * mock the bucket list with FLAT `{filter:{projectId}}` docs.
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

function config(id: string, supportsJsonRender?: boolean): SampleScenarioConfig {
  return { id, order: 1, manifest: manifest(id, supportsJsonRender) };
}

/** A FLAT samples-bucket doc — only the projectId scoping key, NO manifest. */
function flatDoc(scenarioId: string, projectId = scenarioId) {
  return {
    documentId: `doc-${scenarioId}`,
    fileName: `${scenarioId}.pdf`,
    bucketId: SAMPLES_BUCKET_ID,
    filter: { projectId, workflow_id: "wf-x" },
  };
}

function mockDocumentsList(docs: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ documents: docs }), { status: 200 }),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe("ScenarioRegistry — app-side manifest + projectId join", () => {
  afterEach(() => vi.restoreAllMocks());

  it("joins a doc to its scenario by filter.projectId and lifts supportsJsonRender:true", async () => {
    // For unmapped scenario ids, projectId === the slug, so the doc carries projectId='loan'.
    mockDocumentsList([flatDoc("loan")]);
    const scenarios = await new ScenarioRegistry(env, [config("loan", true)]).list();
    const loan = scenarios.find((s) => s.id === "loan");
    expect(loan).toBeDefined();
    expect(loan!.supportsJsonRender).toBe(true);
    expect(loan!.manifest.id).toBe("loan"); // manifest came from the app-side config
    expect(loan!.documents).toEqual([{ documentId: "doc-loan", fileName: "loan.pdf", order: 1 }]);
  });

  it("defaults supportsJsonRender to false when the manifest flag is absent", async () => {
    mockDocumentsList([flatDoc("solar")]);
    const scenarios = await new ScenarioRegistry(env, [config("solar")]).list();
    expect(scenarios.find((s) => s.id === "solar")!.supportsJsonRender).toBe(false);
  });

  it("returns the resolved projectId on each ScenarioConfig", async () => {
    mockDocumentsList([flatDoc("utility", SAMPLE_PROJECT_ID)]);
    const scenarios = await new ScenarioRegistry(env, [config("utility", true)]).list();
    expect(scenarios[0]!.projectId).toBe(SAMPLE_PROJECT_ID);
  });

  it("OMITS a scenario config with no matching bucket doc (not yet seeded)", async () => {
    mockDocumentsList([flatDoc("loan")]); // only loan is in the bucket
    const scenarios = await new ScenarioRegistry(env, [config("loan"), config("ghost")]).list();
    expect(scenarios.map((s) => s.id)).toEqual(["loan"]);
  });

  it("does NOT join a doc whose projectId matches no config (RBAC/data-org isolation)", async () => {
    mockDocumentsList([flatDoc("loan", "proj_someone_else")]);
    const scenarios = await new ScenarioRegistry(env, [config("loan")]).list();
    expect(scenarios).toEqual([]); // loan's projectId ('loan') ≠ the doc's 'proj_someone_else'
  });
});
