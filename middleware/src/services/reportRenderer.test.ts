import { describe, expect, it } from "vitest";

import {
  templateSaveInputSchema,
  type ContentScope,
} from "@groundx/shared";

import {
  UTILITY_REPORT_DOC_INDEX,
  renderReport,
  reportTemplateToSaveInput,
  resolveScopeDocSet,
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
 *   3. `renderReport(request, deps)` — MOCK_MODE returns the Utility fixture;
 *      a `section_ids` subset scopes a re-render; the sample renders
 *      `preview_only`; a BYO scope returns the gate envelope (#10); and the
 *      edge cases degrade visibly (unresolved variable → `{var}` + "bind it";
 *      no source → `—` + low-confidence; question edit → scoped single-section
 *      re-render).
 */

const SAMPLE_BUCKET = 28454;

const utilityScope: ContentScope = {
  type: "bucket",
  bucketId: SAMPLE_BUCKET,
  filter: { project: "utility" },
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

const renderDeps = { mockMode: true, samplesBucketId: SAMPLE_BUCKET };

describe("resolveScopeDocSet + ScopeDocIndex", () => {
  it("resolves a bucket + project filter scope to the project's doc set", () => {
    expect(resolveScopeDocSet(utilityScope, UTILITY_REPORT_DOC_INDEX)).toEqual([
      "utility-bill-2026-04",
    ]);
  });

  it("resolves an explicit documents[] scope to its own ids (index-independent)", () => {
    const scope: ContentScope = { type: "documents", documentIds: ["a", "b"] };
    expect(resolveScopeDocSet(scope, UTILITY_REPORT_DOC_INDEX)).toEqual(["a", "b"]);
  });

  it("resolves a bare bucket (no filter) to every doc the index lists for that bucket", () => {
    const scope: ContentScope = { type: "bucket", bucketId: SAMPLE_BUCKET };
    expect(resolveScopeDocSet(scope, UTILITY_REPORT_DOC_INDEX)).toEqual([
      "utility-bill-2026-04",
    ]);
  });

  it("resolves a multi-doc group scope (shape resolves; the LIVE search is Phase 7/WF-10)", () => {
    const scope: ContentScope = { type: "group", groupId: 9001 };
    const docs = resolveScopeDocSet(scope, UTILITY_REPORT_DOC_INDEX);
    expect(Array.isArray(docs)).toBe(true);
    expect((docs ?? []).length).toBeGreaterThan(1);
  });

  it("returns null for an unknown scope the index can't place", () => {
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

  it("maps a ReportTemplate to a report-kind TemplateSaveInput that the shared schema accepts", () => {
    const input = reportTemplateToSaveInput(template);
    expect(input.kind).toBe("report");
    expect(input.id).toBe("rt-utility-ic-brief");
    expect(input.name).toBe("Utility IC Brief");
    // Round-trips through the shared boundary schema (the saveTemplate repo API
    // validates this exact shape).
    expect(templateSaveInputSchema.safeParse(input).success).toBe(true);
  });

  it("carries the sections into the report body (no scope on the template)", () => {
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

describe("renderReport — MOCK_MODE Utility fixture", () => {
  it("returns the four ordered Utility sections with renderAs + cited bodies", () => {
    const result = renderReport(baseRequest(), renderDeps);
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

  it("renders the sample scope preview_only with the export formats", () => {
    const result = renderReport(baseRequest(), renderDeps);
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.preview_only).toBe(true);
    expect(result.export_formats).toContain("pdf");
    expect(result.report_id).toBeTruthy();
    expect(result.template_id).toBe("rt-utility-ic-brief");
  });

  it("section_ids subset scopes a re-render to those sections only (ordered)", () => {
    const result = renderReport(
      baseRequest({ sectionIds: ["anomalies", "billing_summary"] }),
      renderDeps,
    );
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    // Returned in TEMPLATE order, not request order.
    expect(result.sections.map((s) => s.name)).toEqual(["billing_summary", "anomalies"]);
  });

  it("an empty section_ids subset renders no sections (explicit subset, not 'all')", () => {
    const result = renderReport(baseRequest({ sectionIds: [] }), renderDeps);
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.sections).toHaveLength(0);
  });
});

describe("renderReport — BYO scope → gate envelope (#10)", () => {
  it("a non-sample bucket returns the sign-in gate envelope (not a render)", () => {
    const byoScope: ContentScope = { type: "bucket", bucketId: 70001 };
    const result = renderReport(baseRequest({ scope: byoScope }), renderDeps);
    if (!("gated" in result)) throw new Error("expected the gate envelope for a BYO scope");
    expect(result.gated).toBe(true);
    expect(result.gate).toBe("byo");
  });

  it("a sample scope does NOT gate (anon preview is allowed)", () => {
    const result = renderReport(baseRequest(), renderDeps);
    expect("gated" in result).toBe(false);
  });
});

describe("renderReport — multi-doc ContentScope (fixture-backed shape)", () => {
  it("resolves a multi-doc group scope to a rendered report (live search is Phase 7/WF-10)", () => {
    const groupScope: ContentScope = { type: "group", groupId: 9001 };
    const result = renderReport(baseRequest({ scope: groupScope }), renderDeps);
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.status).toBe("complete");
    expect(result.sections.length).toBeGreaterThan(0);
  });
});

describe("renderReport — edge cases degrade visibly", () => {
  it("an unresolved variable renders the {var} placeholder + a 'bind it' warning", () => {
    // The Utility template's billing_summary question references {billing_period};
    // with no binding supplied, the body keeps the literal {billing_period} token
    // and the section warns to bind it.
    const result = renderReport(
      baseRequest({ templateId: "rt-utility-unbound-variable" }),
      renderDeps,
    );
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    const section = result.sections.find((s) => s.name === "billing_summary");
    expect(section).toBeTruthy();
    expect(section!.body).toContain("{billing_period}");
    expect(section!.warnings?.some((w) => /bind it/i.test(w))).toBe(true);
  });

  it("a bound variable is substituted and does NOT warn", () => {
    const result = renderReport(
      baseRequest({
        templateId: "rt-utility-unbound-variable",
        variables: { billing_period: "March 2026" },
      }),
      renderDeps,
    );
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    const section = result.sections.find((s) => s.name === "billing_summary");
    expect(section!.body).toContain("March 2026");
    expect(section!.body).not.toContain("{billing_period}");
    expect(section!.warnings?.some((w) => /bind it/i.test(w))).toBeFalsy();
    expect(result.resolved_variables.billing_period).toBe("March 2026");
  });

  it("a section with no supporting source renders an em-dash + a low-confidence flag", () => {
    const result = renderReport(
      baseRequest({ templateId: "rt-utility-no-source" }),
      renderDeps,
    );
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    const section = result.sections.find((s) => s.name === "unsupported_claim");
    expect(section).toBeTruthy();
    expect(section!.body).toBe("—");
    expect(section!.cites).toHaveLength(0);
    expect(section!.confidence).toBeLessThan(0.5);
    expect(section!.warnings?.some((w) => /no support/i.test(w))).toBe(true);
  });

  it("a question edit re-renders the single edited section only (scoped re-render)", () => {
    // Editing the anomalies question = a section_ids:["anomalies"] re-render.
    const result = renderReport(
      baseRequest({ sectionIds: ["anomalies"] }),
      renderDeps,
    );
    if ("gated" in result) throw new Error("expected a rendered report, got a gate");
    expect(result.sections.map((s) => s.name)).toEqual(["anomalies"]);
  });
});
