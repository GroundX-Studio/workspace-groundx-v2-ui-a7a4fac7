/**
 * agentic-template-item-editor — single report-section preview.
 *
 * Renders ONE ad-hoc (unsaved) report section against the scope, so the report
 * builder can preview a section's answer with the editor's current values
 * before saving. The report analog of `/api/extract-field` (ad-hoc field). It
 * reuses the SAME per-section grounded render `renderReport` uses internally
 * (`groundedAnswerOverScope` with the report turn plan) — no whole-template
 * render, no pipeline fork — so citation verification + tiering are identical.
 */
import { groundedAnswerOverScope, type GroundedAnswerDeps } from "./groundedAnswer.js";
import type { ContentScope, RenderedSection, ReportSectionItem } from "@groundx/shared";

export async function previewReportSection(
  section: ReportSectionItem,
  contentScope: ContentScope | null,
  deps: GroundedAnswerDeps,
): Promise<RenderedSection> {
  const grounded = await groundedAnswerOverScope(section.question, contentScope, deps, {
    // Same plan renderReport uses for sections: always search the document,
    // never inject product knowledge.
    turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: true },
  });
  return {
    sectionId: section.id,
    body: typeof grounded.body === "string" ? grounded.body : String(grounded.body ?? ""),
    citations: grounded.citations,
    ...(grounded.confidence !== undefined ? { confidence: grounded.confidence } : {}),
    ...(grounded.warnings !== undefined ? { warnings: grounded.warnings } : {}),
  };
}
