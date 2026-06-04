/**
 * Client-side report demo fixtures — the Utility single-doc IC brief + a Solar
 * multi-doc stub (2026-05-29-smart-report-screen Phase 2 / design.md D9). These
 * are a clearly-labeled client demo/test fixture module, NOT a runtime mock
 * toggle (the middleware has no MOCK_MODE — its render path is live).
 *
 * `SmartReportBuilder` reads `getReportFixture(scope)` to SEED the builder's
 * base section rows, and `SmartReportRender` reads `reportTemplateIdForScope`
 * to pick the template id it renders live against. The fixture is a fully
 * formed `RenderedReport` (`Result = Template + Scope + answers`) — sections
 * with `renderAs` formatters + cited bodies.
 *
 * The Utility report is deliberately scoped `bucket + projectId filter`
 * (resolves to the one bill), NOT a document-id list — the demos open on
 * `{ bucket, filter:{ projectId } }` (design.md D4), and the surface is
 * doc-count-agnostic so Solar's `group` scope renders on the same contract.
 */

import type { ContentScope } from "@groundx/shared";

import type { RenderedReport } from "@/types/report";

const UTILITY_DOC = "utility-bill-2026-04";
const UTILITY_PROJECT_ID = "proj_c7701da7-0e08-482a-a496-df9dfe991613";
const UTILITY_PROJECT_IDS = new Set([UTILITY_PROJECT_ID, "proj_utility"]);

function scopeProjectIds(scope: ContentScope): string[] {
  if (scope.type !== "bucket") return [];
  const projectId = scope.filter?.projectId;
  return Array.isArray(projectId) ? projectId : projectId != null ? [projectId] : [];
}

/**
 * The Utility single-document IC-brief report. Scope = `bucket + projectId
 * filter` (the bill). Four sections: billing summary ¶, charge breakdown ▦,
 * anomalies •, recommendation ¶ — each with a cited body into the bill.
 */
const UTILITY_REPORT: RenderedReport = {
  reportId: "rr-utility-ic-brief",
  templateId: "rt-utility-ic-brief",
  scope: { type: "bucket", bucketId: 28454, filter: { projectId: UTILITY_PROJECT_ID } },
  status: "complete",
  resolvedVariables: {},
  exportFormats: ["pdf", "md", "link"],
  previewOnly: true,
  sections: [
    {
      sectionId: "billing_summary",
      name: "billing_summary",
      renderAs: "PARAGRAPH",
      result: {
        sectionId: "billing_summary",
        body:
          "The April 2026 statement totals **$18,742.16** across 8 meters and 56 line-item " +
          "charges. The billing period runs March 1 – March 31, 2026 on account 1023456.",
        citations: [
          {
            documentId: UTILITY_DOC,
            page: 1,
            snippet: "Total Amount Due — $18,742.16",
            tier: "exact",
          },
        ],
        confidence: 0.96,
      },
    },
    {
      sectionId: "charge_breakdown",
      name: "charge_breakdown",
      renderAs: "TABLE",
      result: {
        sectionId: "charge_breakdown",
        body:
          "| Category | Amount |\n| --- | --- |\n| Demand charges | $9,418.00 |\n" +
          "| Energy charges | $6,902.40 |\n| Taxes & fees | $2,421.76 |",
        citations: [
          {
            documentId: UTILITY_DOC,
            page: 3,
            snippet: "Demand Charges — $9,418",
            tier: "exact",
          },
        ],
        confidence: 0.93,
      },
    },
    {
      sectionId: "anomalies",
      name: "anomalies",
      renderAs: "BULLETS",
      result: {
        sectionId: "anomalies",
        body:
          "- Demand charges are 36% higher than the trailing 3-month average.\n" +
          "- Meter 4 shows a 12% kWh jump versus March 2026.",
        citations: [
          {
            documentId: UTILITY_DOC,
            page: 2,
            snippet: "Meter 4 — 4,128 kWh",
            tier: "paraphrase",
          },
        ],
        confidence: 0.81,
        warnings: ["low-coverage: trend baseline is a single prior statement"],
      },
    },
    {
      sectionId: "recommendation",
      name: "recommendation",
      renderAs: "PARAGRAPH",
      result: {
        sectionId: "recommendation",
        body:
          "Review the demand-charge spike before approving payment — a load-shift on Meter 4 " +
          "could recover an estimated $1,100/month.",
        citations: [
          {
            documentId: UTILITY_DOC,
            page: 3,
            snippet: "Demand Charges — $9,418",
            tier: "ambient",
          },
        ],
        confidence: 0.74,
      },
    },
  ],
};

/**
 * Solar multi-doc STUB — a single section over a `group` scope, proving the
 * same surface renders a cross-bucket scope. Real Solar content is WF-10
 * (Phase 7); this is the generality placeholder.
 */
const SOLAR_REPORT_STUB: RenderedReport = {
  reportId: "rr-solar-portfolio",
  templateId: "rt-solar-portfolio",
  scope: { type: "group", groupId: 9001 },
  status: "complete",
  resolvedVariables: {},
  exportFormats: ["pdf", "md", "link"],
  previewOnly: true,
  sections: [
    {
      sectionId: "portfolio_overview",
      name: "portfolio_overview",
      renderAs: "PARAGRAPH",
      result: {
        sectionId: "portfolio_overview",
        body:
          "_(stub)_ Portfolio-wide report across the Solar fund's documents — live multi-doc " +
          "render lands with WF-10.",
        citations: [{ documentId: "solar-doc-1", page: 1, tier: "ambient" }],
      },
    },
  ],
};

/**
 * Look up the demo report fixture for a render-time `ContentScope` (used to
 * seed the builder rows). Returns `null` when no fixture matches (the surface
 * then shows its empty / idle state). Matching is scope-shape-aware:
 *   • `bucket` + Utility `filter.projectId` → the Utility IC brief.
 *   • `group` → the Solar multi-doc stub.
 */
export function getReportFixture(scope: ContentScope): RenderedReport | null {
  if (scope.type === "bucket") {
    if (scopeProjectIds(scope).some((projectId) => UTILITY_PROJECT_IDS.has(projectId))) {
      return UTILITY_REPORT;
    }
    return null;
  }
  if (scope.type === "group") return SOLAR_REPORT_STUB;
  return null;
}

/**
 * Resolve the report **template id** to render for a `ContentScope`. This is a
 * scope→template ROUTING decision (which template the surface renders), NOT a
 * read of the rendered report — `SmartReportRender` obtains the rendered
 * sections from the render endpoint (`renderReport`). Returns `null` when no
 * template applies to the scope (the surface then shows its empty state without
 * a network round-trip). Demo routing: the Utility scope → the IC-brief
 * template, the Solar `group` scope → the portfolio template.
 */
export function reportTemplateIdForScope(scope: ContentScope): string | null {
  if (scope.type === "bucket") {
    if (scopeProjectIds(scope).some((projectId) => UTILITY_PROJECT_IDS.has(projectId))) {
      return UTILITY_REPORT.templateId;
    }
    return null;
  }
  if (scope.type === "group") return SOLAR_REPORT_STUB.templateId;
  return null;
}
