import { describe, expect, it, vi } from "vitest";

import {
  templateSaveInputSchema,
  type ContentScope,
} from "@groundx/shared";

import type { GroundXClient, LlmClient } from "../types.js";

import {
  UTILITY_REPORT_DOC_INDEX,
  renderReport,
  reportTemplateToSaveInput,
  resolveScopeDocSet,
  type RenderReportDeps,
  type ReportTemplate,
  type RenderReportRequest,
} from "./reportRenderer.js";

/**
 * Smart Report render endpoint (2026-05-29-smart-report-screen Phase 6 /
 * design.md D5). The render service runs a report `Template` over a
 * `ContentScope` and returns ordered cited sections.
 *
 * Three pieces are RE-ADDED here with their real (render-endpoint) caller,
 * per the locked "no code with no caller" rule:
 *   1. `resolveScopeDocSet(scope, index)` + `ScopeDocIndex` + the
 *      `UTILITY_REPORT_DOC_INDEX` — the scope → doc-set resolver. The render
 *      service consumes it to know which documents a scope targets.
 *   2. `reportTemplateToSaveInput(template)` — the report-kind
 *      `TemplateSaveInput` save bridge to the shared `saveTemplate` repo API.
 *   3. `renderReport(request, deps)` — runs the persisted Template over a
 *      `ContentScope` via the live search + grounded-generation path (fakes
 *      injected at the dependency seam): a `section_ids` subset scopes a
 *      re-render; the sample renders `preview_only`; a BYO scope returns the
 *      gate envelope (#10); a missing template renders the no-template state;
 *      and the edge cases degrade visibly (unresolved variable → `{var}` +
 *      "bind it"; no source → `—` + low-confidence; question edit → scoped
 *      single-section re-render). There is no MOCK_MODE fixture path.
 */

const SAMPLE_BUCKET = 28454;
const SAMPLE_PROJECT_ID = "proj_c7701da7-0e08-482a-a496-df9dfe991613";

const utilityScope: ContentScope = {
  type: "bucket",
  bucketId: SAMPLE_BUCKET,
  filter: { projectId: SAMPLE_PROJECT_ID },
};

function baseRequest(overrides: Partial<RenderReportRequest> = {}): RenderReportRequest {
  return {
    templateId: "rt-utility-ic-brief",
    scope: utilityScope,
    variables: {},
    sectionIds: null,
    chatSessionId: "cs-1",
    parentMessageId: null,
    ...overrides,
  };
}

/** A canned GroundX search hit + grounded LLM reply for the live render path
 * (2026-06-01-retire-mock-mode re-grounded the former MOCK_MODE-fixture tests
 * onto the live path with fakes injected at the dependency seam). The LLM emits
 * the supplied `body` with a verifiable `citations` block citing `doc`. */
function liveClients(doc: string, body: string): { groundxClient: GroundXClient; llmClient: LlmClient } {
  const groundxClient: GroundXClient = {
    forward: vi.fn(async () => jsonOk({ search: { results: [{ documentId: doc, text: body }] } })),
  };
  const llmAnswer = [
    body,
    "",
    "```json",
    `{"citations":[{"documentId":"${doc}","page":1,"quote":${JSON.stringify(body.slice(0, 40))}}]}`,
    "```",
  ].join("\n");
  const llmClient: LlmClient = {
    forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
  };
  return { groundxClient, llmClient };
}

/** The 4-section Utility IC-brief template the demo renders, used as the live
 * `getTemplate` source for the re-grounded fixture-equivalent tests. */
const utilityTemplate: ReportTemplate = {
  id: "rt-utility-ic-brief",
  name: "Utility IC Brief",
  format: "ic-brief",
  sections: [
    { id: "billing_summary", name: "billing_summary", renderAs: "PARAGRAPH", question: "Summarize the billing period and total.", variables: [] },
    { id: "charge_breakdown", name: "charge_breakdown", renderAs: "TABLE", question: "Break down the charges.", variables: [] },
    { id: "anomalies", name: "anomalies", renderAs: "BULLETS", question: "List anomalies.", variables: [] },
    { id: "recommendation", name: "recommendation", renderAs: "PARAGRAPH", question: "Recommend next steps.", variables: [] },
  ],
};

/** Live render deps that resolve `rt-utility-ic-brief` to the 4-section
 * template and ground every section against `utility-bill-2026-04`. */
function utilityLiveDeps(): RenderReportDeps {
  const { groundxClient, llmClient } = liveClients("utility-bill-2026-04", "The total amount due is $214.07.");
  return {
    samplesBucketId: SAMPLE_BUCKET,
    getTemplate: async () => utilityTemplate,
    groundxClient,
    groundxApiKey: "k",
    llmClient,
    llmModelId: "test-model",
  };
}

describe("resolveScopeDocSet + ScopeDocIndex", () => {
  it("resolves a bucket + projectId filter scope to the project's doc set", async () => {
    expect(resolveScopeDocSet(utilityScope, UTILITY_REPORT_DOC_INDEX)).toEqual([
      "utility-bill-2026-04",
    ]);
  });

  it("uses projectId, not the stale project key, when resolving product report scopes", async () => {
    const staleFilter = { ["project"]: "utility" };
    const index = {
      buckets: {
        [SAMPLE_BUCKET]: {
          [SAMPLE_PROJECT_ID]: ["utility-bill-2026-04"],
        },
      },
      groups: {},
    };

    expect(resolveScopeDocSet(utilityScope, index)).toEqual(["utility-bill-2026-04"]);
    expect(
      resolveScopeDocSet(
        { type: "bucket", bucketId: SAMPLE_BUCKET, filter: staleFilter },
        index,
      ),
    ).toBeNull();
  });

  it("resolves an explicit documents[] scope to its own ids (index-independent)", async () => {
    const scope: ContentScope = { type: "documents", documentIds: ["a", "b"] };
    expect(resolveScopeDocSet(scope, UTILITY_REPORT_DOC_INDEX)).toEqual(["a", "b"]);
  });

  it("resolves a bare bucket (no filter) to every doc the index lists for that bucket", async () => {
    const scope: ContentScope = { type: "bucket", bucketId: SAMPLE_BUCKET };
    expect(resolveScopeDocSet(scope, UTILITY_REPORT_DOC_INDEX)).toEqual([
      "utility-bill-2026-04",
    ]);
  });

  it("resolves a multi-doc group scope (shape resolves; the LIVE search is Phase 7/WF-10)", async () => {
    const scope: ContentScope = { type: "group", groupId: 9001 };
    const docs = resolveScopeDocSet(scope, UTILITY_REPORT_DOC_INDEX);
    expect(Array.isArray(docs)).toBe(true);
    expect((docs ?? []).length).toBeGreaterThan(1);
  });

  it("returns null for an unknown scope the index can't place", async () => {
    const scope: ContentScope = { type: "bucket", bucketId: 999999 };
    expect(resolveScopeDocSet(scope, UTILITY_REPORT_DOC_INDEX)).toBeNull();
  });
});

describe("reportTemplateToSaveInput — report-kind save bridge", () => {
  const template: ReportTemplate = {
    id: "rt-utility-ic-brief",
    name: "Utility IC Brief",
    format: "ic-brief",
    sections: [
      {
        id: "billing_summary",
        name: "billing_summary",
        renderAs: "PARAGRAPH",
        question: "Summarize the billing period and total.",
        variables: [],
        instructions: "Cite the total\nUse one paragraph",
      },
    ],
  };

  it("maps a ReportTemplate to a report-kind TemplateSaveInput that the shared schema accepts", async () => {
    const input = reportTemplateToSaveInput(template);
    expect(input.kind).toBe("report");
    expect(input.id).toBe("rt-utility-ic-brief");
    expect(input.name).toBe("Utility IC Brief");
    // Round-trips through the shared boundary schema (the saveTemplate repo API
    // validates this exact shape).
    expect(templateSaveInputSchema.safeParse(input).success).toBe(true);
  });

  it("carries the sections into the report body (no scope on the template)", async () => {
    const input = reportTemplateToSaveInput(template);
    if (input.kind !== "report") throw new Error("expected report kind");
    expect(input.body.sections).toHaveLength(1);
    expect(input.body.sections[0]).toMatchObject({
      id: "billing_summary",
      renderAs: "PARAGRAPH",
      question: "Summarize the billing period and total.",
    });
    expect(input.body.sections[0]).not.toHaveProperty("scope");
  });
});

describe("renderReport — live Utility render (re-grounded off the former MOCK_MODE fixture)", () => {
  it("returns the four ordered Utility sections with renderAs taxonomy + cited bodies", async () => {
    const result = await renderReport(baseRequest(), utilityLiveDeps());
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.status).toBe("complete");
    expect(result.sections.map((s) => s.name)).toEqual([
      "billing_summary",
      "charge_breakdown",
      "anomalies",
      "recommendation",
    ]);
    expect(result.sections.map((s) => s.render_as)).toEqual([
      "PARAGRAPH",
      "TABLE",
      "BULLETS",
      "PARAGRAPH",
    ]);
    for (const section of result.sections) {
      expect(section.cites.length).toBeGreaterThan(0);
      expect(section.cites[0].documentId).toBe("utility-bill-2026-04");
    }
  });

  it("renders the sample scope preview_only with the export formats", async () => {
    const result = await renderReport(baseRequest(), utilityLiveDeps());
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.preview_only).toBe(true);
    expect(result.export_formats).toContain("pdf");
    expect(result.report_id).toBeTruthy();
    expect(result.template_id).toBe("rt-utility-ic-brief");
  });

  it("section_ids subset scopes a re-render to those sections only (ordered)", async () => {
    const result = await renderReport(
      baseRequest({ sectionIds: ["anomalies", "billing_summary"] }),
      utilityLiveDeps(),
    );
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    // Returned in TEMPLATE order, not request order.
    expect(result.sections.map((s) => s.name)).toEqual(["billing_summary", "anomalies"]);
  });

  it("an empty section_ids subset renders no sections (explicit subset, not 'all')", async () => {
    const result = await renderReport(baseRequest({ sectionIds: [] }), utilityLiveDeps());
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.sections).toHaveLength(0);
  });

  it("a question edit re-renders the single edited section only (scoped re-render)", async () => {
    // Editing the anomalies question = a section_ids:["anomalies"] re-render.
    const result = await renderReport(baseRequest({ sectionIds: ["anomalies"] }), utilityLiveDeps());
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.sections.map((s) => s.name)).toEqual(["anomalies"]);
  });
});

describe("renderReport — BYO scope → gate envelope (#10)", () => {
  it("a non-sample bucket returns the sign-in gate envelope (not a render)", async () => {
    const byoScope: ContentScope = { type: "bucket", bucketId: 70001 };
    const result = await renderReport(baseRequest({ scope: byoScope }), utilityLiveDeps());
    if (!("gated" in result)) throw new Error("expected the gate envelope for a BYO scope");
    expect(result.gated).toBe(true);
    expect(result.gate).toBe("byo");
  });

  it("a sample scope does NOT gate (anon preview is allowed)", async () => {
    const result = await renderReport(baseRequest(), utilityLiveDeps());
    expect("gated" in result).toBe(false);
  });
});

describe("renderReport — multi-doc ContentScope (live group render)", () => {
  it("resolves a multi-doc group scope to a rendered report", async () => {
    const groupScope: ContentScope = { type: "group", groupId: 9001 };
    const result = await renderReport(baseRequest({ scope: groupScope }), utilityLiveDeps());
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.status).toBe("complete");
    expect(result.sections.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// 2026-06-01-live-report-render — the LIVE path (no MOCK_MODE).
// ────────────────────────────────────────────────────────────────────

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Injected clients that THROW if touched — proves a branch short-circuits
 * BEFORE any search/LLM call (gate / no-template / empty-scope). */
function throwingClients(): { groundxClient: GroundXClient; llmClient: LlmClient } {
  return {
    groundxClient: { forward: vi.fn(async () => { throw new Error("groundx must not be called"); }) },
    llmClient: { forward: vi.fn(async () => { throw new Error("llm must not be called"); }) },
  };
}

/** A real user-created report template (the live path's section-question source). */
const liveTemplate: ReportTemplate = {
  id: "rt-live-1",
  name: "Live Report",
  format: "ic-brief",
  sections: [
    {
      id: "billing_summary",
      name: "billing_summary",
      renderAs: "PARAGRAPH",
      question: "What is the total amount due?",
      variables: [],
    },
    {
      id: "anomalies",
      name: "anomalies",
      renderAs: "BULLETS",
      question: "Are there any anomalies?",
      variables: [],
    },
  ],
};

describe("renderReport — §1 no-template state (the new-customer norm)", () => {
  it("returns the graceful no-template state (reason: no_template) without touching clients", async () => {
    const { groundxClient, llmClient } = throwingClients();
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => null, // the new-customer norm — no template yet
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };
    const result = await renderReport(baseRequest({ templateId: "does-not-exist" }), deps);
    if ("gated" in result) throw new Error("expected a render, got a gate");
    expect(result.status).toBe("complete");
    expect(result.sections).toEqual([]);
    expect(result.preview_only).toBe(true);
    expect(result.reason).toBe("no_template");
    // No search / LLM call was made.
    expect(groundxClient.forward).not.toHaveBeenCalled();
    expect(llmClient.forward).not.toHaveBeenCalled();
  });
});

describe("renderReport — §5 live per-section render (search → ground → verify)", () => {
  it("renders sections from the persisted template's questions with verified citations, in template order", async () => {
    // One canned search hit + a grounded answer with a verbatim quote → a
    // verified (paraphrase-tier) citation. Same canned reply for both sections.
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({ search: { results: [{ documentId: "utility-bill-2026-04", text: "the total amount due is $18,742.16" }] } }),
      ),
    };
    const llmAnswer = [
      "The total amount due is $18,742.16.",
      "",
      "```json",
      '{"citations":[{"documentId":"utility-bill-2026-04","page":1,"quote":"total amount due is $18,742.16"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => liveTemplate,
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };

    const result = await renderReport(baseRequest({ templateId: "rt-live-1" }), deps);
    if ("gated" in result) throw new Error("expected a render, got a gate");
    // Template order honored.
    expect(result.sections.map((s) => s.name)).toEqual(["billing_summary", "anomalies"]);
    // Bodies are the LLM output (JSON block stripped).
    expect(result.sections[0].body).toBe("The total amount due is $18,742.16.");
    // Cites are verified — a WF-06b tier + confidence.
    const cite = result.sections[0].cites[0];
    expect(cite.documentId).toBe("utility-bill-2026-04");
    expect(["exact", "paraphrase", "ambient"]).toContain(cite.tier);
    expect(cite.tier).toBe("paraphrase");
    expect(cite.confidence).toBeGreaterThan(0);
    // Search + LLM actually ran per section (one grounded LLM call per section;
    // groundx may issue an extra X-Ray/retry round-trip per search).
    expect(groundxClient.forward).toHaveBeenCalled();
    expect(llmClient.forward).toHaveBeenCalledTimes(2);
  });

  it("honors a section_ids subset in template order on the live path", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "n/a" } }] })),
    };
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => liveTemplate,
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };
    const result = await renderReport(
      baseRequest({ templateId: "rt-live-1", sectionIds: ["anomalies"] }),
      deps,
    );
    if ("gated" in result) throw new Error("expected a render, got a gate");
    expect(result.sections.map((s) => s.name)).toEqual(["anomalies"]);
    // Exactly one section was generated → exactly one grounded LLM call.
    expect(llmClient.forward).toHaveBeenCalledTimes(1);
  });

  it("the old 'not yet wired' throw is gone — a live render no longer throws", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "answer" } }] })),
    };
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => liveTemplate,
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };
    await expect(renderReport(baseRequest({ templateId: "rt-live-1" }), deps)).resolves.toBeDefined();
  });
});

describe("renderReport — §4 live + fixture share one degradation path", () => {
  it("a live section with ZERO verified citations degrades to '—' + ⚠ no support in docs", async () => {
    // Search returns nothing → no snippets → no citations → no-support degrade.
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "Some unsupported prose." } }] })),
    };
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => ({
        ...liveTemplate,
        sections: [liveTemplate.sections[0]],
      }),
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };
    const result = await renderReport(baseRequest({ templateId: "rt-live-1" }), deps);
    if ("gated" in result) throw new Error("expected a render, got a gate");
    const section = result.sections[0];
    expect(section.body).toBe("—");
    expect(section.cites).toHaveLength(0);
    expect(section.confidence).toBeLessThan(0.5);
    expect(section.warnings?.some((w) => /no support/i.test(w))).toBe(true);
  });

  it("a live section body with an unbound {variable} keeps the placeholder + adds a bind-it warning", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [{ documentId: "utility-bill-2026-04", text: "period is March 2026" }] } })),
    };
    // LLM emits a body with an unbound {billing_period} token + a verified cite
    // (so the no-support degrade does NOT fire and the variable path is exercised).
    const llmAnswer = [
      "The billing period is {billing_period}.",
      "",
      "```json",
      '{"citations":[{"documentId":"utility-bill-2026-04","page":1,"quote":"period is March 2026"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => ({ ...liveTemplate, sections: [liveTemplate.sections[0]] }),
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };
    const result = await renderReport(baseRequest({ templateId: "rt-live-1" }), deps);
    if ("gated" in result) throw new Error("expected a render, got a gate");
    const section = result.sections[0];
    expect(section.body).toContain("{billing_period}");
    expect(section.warnings?.some((w) => /bind it/i.test(w))).toBe(true);
  });
});

describe("renderReport — §6 async + stable wire shape", () => {
  it("renderReport returns a Promise", () => {
    const r = renderReport(baseRequest(), utilityLiveDeps());
    expect(typeof (r as Promise<unknown>).then).toBe("function");
    return r; // settle it so no unhandled-promise warning
  });

  it("the live result satisfies the documented RenderReportResponse wire shape", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [{ documentId: "utility-bill-2026-04", text: "total amount due is $18,742.16" }] } })),
    };
    const llmAnswer = [
      "The total amount due is $18,742.16.",
      "```json",
      '{"citations":[{"documentId":"utility-bill-2026-04","page":1,"quote":"total amount due is $18,742.16"}]}',
      "```",
    ].join("\n");
    const liveDeps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => ({ ...liveTemplate, sections: [liveTemplate.sections[0]] }),
      groundxClient,
      groundxApiKey: "k",
      llmClient: { forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })) },
      llmModelId: "test-model",
    };
    const live = await renderReport(baseRequest({ templateId: "rt-live-1" }), liveDeps);
    if ("gated" in live) throw new Error("expected a render");
    // The documented top-level wire keys (a render omits the `reason` field).
    expect(Object.keys(live).filter((k) => k !== "reason").sort()).toEqual(
      ["export_formats", "preview_only", "report_id", "resolved_variables", "sections", "status", "template_id"],
    );
    // Section wire keys.
    expect(Object.keys(live.sections[0]).sort()).toEqual(
      expect.arrayContaining(["name", "render_as", "body", "cites"]),
    );
  });
});

describe("renderReport — §7 gate + idle parity (no MOCK_MODE)", () => {
  it("a BYO scope returns the gate envelope before any search/LLM call", async () => {
    const { groundxClient, llmClient } = throwingClients();
    const byoScope: ContentScope = { type: "bucket", bucketId: 70001 };
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => liveTemplate,
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };
    const result = await renderReport(baseRequest({ scope: byoScope }), deps);
    if (!("gated" in result)) throw new Error("expected the gate envelope for a BYO scope");
    expect(result.gate).toBe("byo");
    expect(groundxClient.forward).not.toHaveBeenCalled();
    expect(llmClient.forward).not.toHaveBeenCalled();
  });

  it("a sample scope that resolves to an empty doc set idles (reason: empty_scope) without an LLM call", async () => {
    const { groundxClient, llmClient } = throwingClients();
    // A bucket the doc index can't place → empty doc set.
    const emptyScope: ContentScope = { type: "bucket", bucketId: SAMPLE_BUCKET, filter: { projectId: "proj_missing" } };
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => liveTemplate,
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };
    const result = await renderReport(baseRequest({ scope: emptyScope }), deps);
    if ("gated" in result) throw new Error("expected an idle render, got a gate");
    expect(result.sections).toEqual([]);
    expect(result.reason).toBe("empty_scope");
    expect(groundxClient.forward).not.toHaveBeenCalled();
    expect(llmClient.forward).not.toHaveBeenCalled();
  });

  it("missing live deps throw a clear error (not 'not yet wired')", async () => {
    const deps: RenderReportDeps = {
      samplesBucketId: SAMPLE_BUCKET,
      getTemplate: async () => liveTemplate,
      // no groundxClient / apiKey / llm
    };
    await expect(renderReport(baseRequest({ templateId: "rt-live-1" }), deps)).rejects.toThrow(
      /live report render requires/i,
    );
  });
});
