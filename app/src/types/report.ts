/**
 * Report data model — app-owned types for the Smart Report screen
 * (2026-05-29-smart-report-screen Phase 2 / design.md D3-D4).
 *
 * Foundational rule (locked `Template + Scope + Results`): a Report **result**
 * = a Report **template** (questions, scope-INDEPENDENT) + a **scope**
 * (`ContentScope`, supplied at render time) + generated section answers
 * (`RenderedSection`, the shared `GeneratedResult` specialization).
 *
 * Scope is NEVER stored on the template or its sections; it is a render-time
 * input recorded on the rendered result.
 *
 * SCOPE OF THIS MODULE (Phase 3 render surface). This file ships ONLY the
 * rendered-report shape the render surface (`SmartReportRender`) consumes
 * today. The scope→doc-set resolver, the existing-or-new pin resolver, and the
 * `ReportTemplate`→`TemplateSaveInput` save bridge are authored together with
 * their real callers — the pin affordance / `pin_to_report` tool (Phase 5) and
 * the render + Save endpoints (Phase 6). They are deliberately NOT added here
 * as test-only exports (per the locked "no code with no caller / name the 2nd
 * real caller before abstracting" rule).
 */

import type { ContentScope, RenderedSection } from "@groundx/shared";

/** How a section's generated body renders (¶ / • / ▦). */
export type ReportSectionRenderAs = "PARAGRAPH" | "BULLETS" | "TABLE";

/**
 * A rendered report — `Result = Template + Scope + answers`. The result carries
 * the `scope` it was rendered over (the template stays scope-independent). Each
 * `sections[]` entry is the shared `RenderedSection` (`GeneratedResult`
 * specialization) keyed by `sectionId`, paired with its display metadata.
 */
export interface RenderedReportSection {
  sectionId: string;
  name: string;
  renderAs: ReportSectionRenderAs;
  /** The shared generated result for this section (markdown body + citations). */
  result: RenderedSection;
}

export interface RenderedReport {
  reportId: string;
  templateId: string;
  /** The render-time scope this report was generated over. */
  scope: ContentScope;
  status: "idle" | "streaming" | "complete" | "error";
  sections: RenderedReportSection[];
  resolvedVariables: Record<string, string>;
  exportFormats: ("pdf" | "md" | "link")[];
  /** Sample-doc renders are preview-only (export/save locked); #9. */
  previewOnly: boolean;
}
