import { describe, expect, it } from "vitest";

import type { ContentScope } from "@groundx/shared";

import { getReportFixture, reportTemplateIdForScope } from "./reportFixtures";

describe("report MOCK_MODE fixtures — 2026-05-29-smart-report-screen Phase 2", () => {
  const utilityScope: ContentScope = {
    type: "bucket",
    bucketId: 28454,
    filter: { project: "utility" },
  };

  it("the Utility report fixture is scoped bucket+project-filter (NOT a document-id list)", () => {
    const report = getReportFixture(utilityScope);
    expect(report).not.toBeNull();
    expect(report!.scope.type).toBe("bucket");
    if (report!.scope.type === "bucket") {
      expect(report!.scope.filter).toMatchObject({ project: "utility" });
    }
  });

  it("the Utility fixture has the four IC-brief sections with the right renderAs mix", () => {
    const report = getReportFixture(utilityScope)!;
    const names = report.sections.map((s) => s.name);
    expect(names).toEqual([
      "billing_summary",
      "charge_breakdown",
      "anomalies",
      "recommendation",
    ]);
    const renderAsByName = Object.fromEntries(report.sections.map((s) => [s.name, s.renderAs]));
    expect(renderAsByName).toMatchObject({
      billing_summary: "PARAGRAPH",
      charge_breakdown: "TABLE",
      anomalies: "BULLETS",
      recommendation: "PARAGRAPH",
    });
  });

  it("every Utility section body carries at least one citation into the bill", () => {
    const report = getReportFixture(utilityScope)!;
    for (const section of report.sections) {
      expect(section.result.citations.length).toBeGreaterThanOrEqual(1);
      expect(section.result.citations[0].documentId).toBe("utility-bill-2026-04");
    }
  });

  it("a Solar group scope returns the stubbed multi-doc fixture", () => {
    const solarScope: ContentScope = { type: "group", groupId: 9001 };
    const report = getReportFixture(solarScope);
    expect(report).not.toBeNull();
    expect(report!.scope.type).toBe("group");
    expect(report!.sections.length).toBeGreaterThanOrEqual(1);
  });

  it("an unknown scope returns null (no fixture)", () => {
    const unknown: ContentScope = { type: "documents", documentIds: ["nope"] };
    expect(getReportFixture(unknown)).toBeNull();
  });
});

describe("reportTemplateIdForScope — scope→template routing (2026-05-31-smart-report-followups)", () => {
  it("routes a Utility bucket+project scope to the IC-brief template id", () => {
    const utilityScope: ContentScope = {
      type: "bucket",
      bucketId: 28454,
      filter: { project: "utility" },
    };
    // The template id (NOT a rendered report) — the surface fetches the report
    // from the endpoint using this id; the helper only decides WHICH template.
    expect(reportTemplateIdForScope(utilityScope)).toBe("rt-utility-ic-brief");
    expect(reportTemplateIdForScope(utilityScope)).toBe(getReportFixture(utilityScope)!.templateId);
  });

  it("routes a Solar group scope to the portfolio template id", () => {
    const solarScope: ContentScope = { type: "group", groupId: 9001 };
    expect(reportTemplateIdForScope(solarScope)).toBe("rt-solar-portfolio");
  });

  it("returns null for a scope with no template (surface shows empty, no network call)", () => {
    const noTemplate: ContentScope = { type: "documents", documentIds: ["nope"] };
    expect(reportTemplateIdForScope(noTemplate)).toBeNull();
    const loanScope: ContentScope = {
      type: "bucket",
      bucketId: 28454,
      filter: { project: "loan" },
    };
    expect(reportTemplateIdForScope(loanScope)).toBeNull();
  });
});
