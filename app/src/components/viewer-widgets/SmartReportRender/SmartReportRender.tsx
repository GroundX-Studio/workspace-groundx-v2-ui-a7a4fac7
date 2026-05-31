/**
 * SmartReportRender — the Report render surface (f4 / S3).
 *
 * A **ScopedViewerWidget** (PdfViewer · Extract · SmartReport · Integrate):
 * it takes a REQUIRED `scope: ContentScope` and adapts its data on
 * scope-identity change via `useScopeAdapter`.
 *
 * The widget's `show_smart_report_render` canvas-dispatch descriptor +
 * `*.tools.ts` surface (and the `show_` verb allowlist add + the
 * `SERVER_TOOL_CATALOG` mirror) land together in Phase 5 (step 17), when the
 * real dispatch + the production ScopedViewerWidget registry singleton land —
 * NOT registered here, where it would be a no-op tool with no caller.
 *
 * Reuses the Extract render approach: ordered sections stream in, each a
 * generated body rendered by its `renderAs` formatter (¶ PARAGRAPH / •
 * BULLETS / ▦ TABLE — all via the shared `Markdown` primitive) with the shared
 * `CiteChip` in the section footer (click → `highlightCitation` → the
 * `PdfViewerWidget` lit-region, the shipped clickable-citation path).
 *
 * `Result = Template + Scope + answers`: the rendered report
 * (`RenderedReport`) carries the scope it was rendered over; the template
 * stays scope-independent. v1 reads a MOCK_MODE fixture keyed by the scope
 * (`getReportFixture`); the live render endpoint + multi-doc fan-out are
 * Phases 6-7.
 *
 * Per `widget-role-access`: `role: WidgetRole` is the authorization axis.
 * Export / Save are locked-for-anonymous (`widgetRoleCanEdit`); a sample-doc
 * render is `preview_only` (#9). The `✎ edit §N` affordance per heading fires
 * `onEditSection` (the host routes it to f4a with the section pre-selected).
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type FC, useState } from "react";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import { widgetRoleCanEdit } from "@groundx/shared";

import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { Markdown } from "@/components/primitives/Markdown/Markdown";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";
import { getReportFixture } from "@/widgets/reportFixtures";
import type { RenderedReport, RenderedReportSection } from "@/types/report";

export interface SmartReportRenderProps {
  /**
   * REQUIRED render-time scope (a real `ContentScope` — this is a
   * ScopedViewerWidget). The demos open on `{ bucket, filter:{ project } }`;
   * the surface is doc-count-agnostic so a `group` scope renders identically.
   */
  scope: ContentScope;
  /**
   * Authorization role (`anonymous` | `member`). Gates the export / Save
   * affordances (`widgetRoleCanEdit`); the rendered sections are read-only for
   * both. Surfaced via `data-role`.
   */
  role: WidgetRole;
  /** Fired by `✎ edit §N` — the host routes to f4a with this section selected. */
  onEditSection?: (sectionId: string) => void;
}

/** Single-character glyph for a section's render mode (¶ / • / ▦). */
function renderAsGlyph(renderAs: RenderedReportSection["renderAs"]): string {
  switch (renderAs) {
    case "PARAGRAPH":
      return "¶";
    case "BULLETS":
      return "•";
    case "TABLE":
      return "▦";
  }
}

/** Title-case a snake_case section name for display. */
function humanizeName(name: string): string {
  return name
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const SmartReportRender: FC<SmartReportRenderProps> = ({ scope, role, onEditSection }) => {
  // ScopedViewerWidget adaptation: re-resolve the report whenever the scope
  // IDENTITY changes (via `useScopeAdapter` — not on every render). The
  // resolved report is held in state, so the adapter is the load-bearing
  // data-load path (NOT a no-op alongside a direct read). v1 resolves the
  // MOCK_MODE fixture synchronously; Phase 6 swaps this body for the live
  // `POST /reports/render` fetch with no change to the contract.
  const [report, setReport] = useState<RenderedReport | null>(() => getReportFixture(scope));
  useScopeAdapter(scope, (nextScope) => {
    setReport(getReportFixture(nextScope));
  });

  const canEdit = widgetRoleCanEdit(role);

  return (
    <Box
      data-testid="smart-report-render"
      data-role={role}
      aria-label="Report render surface"
      sx={{
        height: "100%",
        overflow: "auto",
        backgroundColor: WHITE,
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {report == null ? (
        <Box
          data-testid="smart-report-empty"
          sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION, p: 2 }}
        >
          No report for this scope yet. Pin an answer or open the builder to start one.
        </Box>
      ) : (
        <>
          {report.previewOnly ? (
            <Box
              data-testid="smart-report-preview-badge"
              sx={{
                alignSelf: "flex-start",
                color: EYEBROW_ON_LIGHT,
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Preview only · sign in to export
            </Box>
          ) : null}

          {report.sections.map((section, i) => (
            <Box
              key={section.sectionId}
              data-testid={`report-section-${section.sectionId}`}
              sx={{
                border: `1px solid ${BORDER}`,
                borderRadius: BORDER_RADIUS_2X,
                backgroundColor: WARM_OFFWHITE,
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Box
                  component="h3"
                  data-testid={`report-section-heading-${section.sectionId}`}
                  sx={{
                    m: 0,
                    color: NAVY,
                    fontSize: FONT_SIZE_CAPTION,
                    fontWeight: FONT_WEIGHT_HEADLINE,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                  }}
                >
                  <Box component="span" aria-hidden sx={{ color: BODY_TEXT }}>
                    {renderAsGlyph(section.renderAs)}
                  </Box>
                  {humanizeName(section.name)}
                </Box>
                {/* ✎ edit §N — opens the builder (f4a) with this section
                    pre-selected. Rendered for every role; whether the edit
                    *persists* is gated at the builder Save boundary. */}
                <Box
                  component="button"
                  type="button"
                  data-testid={`report-section-edit-${section.sectionId}`}
                  aria-label={`Edit section ${i + 1}`}
                  onClick={() => onEditSection?.(section.sectionId)}
                  sx={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: NAVY,
                    fontSize: FONT_SIZE_LABEL,
                    fontWeight: FONT_WEIGHT_LABEL,
                    p: 0,
                    "&:focus-visible": { outline: `2px solid ${NAVY}` },
                  }}
                >
                  {`✎ edit §${i + 1}`}
                </Box>
              </Box>

              <Box sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION }}>
                <Markdown>{section.result.body}</Markdown>
              </Box>

              {section.result.warnings && section.result.warnings.length > 0 ? (
                <Box
                  data-testid={`report-section-warnings-${section.sectionId}`}
                  sx={{ color: EYEBROW_ON_LIGHT, fontSize: FONT_SIZE_LABEL }}
                >
                  {section.result.warnings.join(" · ")}
                </Box>
              ) : null}

              {section.result.citations.length > 0 ? (
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                  {section.result.citations.map((citation, ci) => (
                    <CiteChip
                      key={`${section.sectionId}-${ci}`}
                      citation={citation}
                      // Global 1-based chip index across the report so the
                      // Phase-0 `cite-chip-1` testid resolves on the first chip.
                      index={
                        report.sections
                          .slice(0, i)
                          .reduce((n, s) => n + s.result.citations.length, 0) +
                        ci +
                        1
                      }
                      color={section.result.warnings && section.result.warnings.length > 0 ? "coral" : "cyan"}
                    />
                  ))}
                </Stack>
              ) : null}
            </Box>
          ))}

          {/* Export / Save are locked-for-anonymous (#9 / role gate). The
              control renders for both roles; the lock is the disabled state +
              the preview badge above. */}
          <Box
            data-testid="smart-report-export"
            aria-disabled={!canEdit || report.previewOnly || undefined}
            sx={{
              alignSelf: "flex-start",
              color: canEdit && !report.previewOnly ? NAVY : BODY_TEXT,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              opacity: canEdit && !report.previewOnly ? 1 : 0.6,
            }}
          >
            {canEdit && !report.previewOnly ? "export ▾ · 💾 Save" : "export ▾ 🔒 · 💾 Save 🔒"}
          </Box>
        </>
      )}
    </Box>
  );
};

export default SmartReportRender;
