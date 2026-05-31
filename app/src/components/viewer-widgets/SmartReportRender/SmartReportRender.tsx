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
 * stays scope-independent. The **initial paint** routes through the render
 * endpoint (`POST /api/widgets/smart-report/reports/render` via `renderReport`)
 * exactly like the **↻ re-render** control — both converge on ONE fetch path
 * (`runRender`), so the surface the user first sees on the Report pill is the
 * endpoint response, not a synchronous client-side fixture read
 * (2026-05-31-smart-report-followups closes that round-trip; MOCK_MODE backs
 * the server response, so the displayed sections are unchanged). The first
 * paint has an explicit lifecycle — `loading` (fetch in flight) → `ready`
 * (endpoint response shown) / `empty` (endpoint returned no sections) /
 * `error` (the call rejected, with a retry). `useScopeAdapter` re-runs the
 * SAME fetch on a scope-identity change. The live multi-doc fan-out is Phase 7
 * (BLOCKED on WF-10) — the same endpoint serves it with no surface rework.
 *
 * The template id the first paint renders is resolved from the scope via
 * `reportTemplateIdForScope` (MOCK_MODE: the Utility scope → the IC-brief
 * template). When the scope has no template, the surface shows the empty state
 * without a network round-trip.
 *
 * Per `widget-role-access`: `role: WidgetRole` is the authorization axis.
 * Export / Save are locked-for-anonymous (`widgetRoleCanEdit`); a sample-doc
 * render is `preview_only` (#9). The `✎ edit §N` affordance per heading dispatches
 * the `editTemplate` CanvasIntent through the orchestrator (the same intent the
 * `show_smart_report_edit` tool emits), routing to the builder (f4a) with the
 * section pre-selected — no host callback prop (the `{ scope, role }` ScopedCanvas
 * contract can't supply one).
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type FC, useCallback, useState } from "react";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import { widgetRoleCanEdit } from "@groundx/shared";

import { renderReport } from "@/api/smartReport";
import { CiteChip } from "@/components/brand/CiteChip/CiteChip";
import { Markdown } from "@/components/primitives/Markdown/Markdown";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  CORAL,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useCanvasOrchestratorOptional } from "@/contexts/CanvasOrchestratorContext";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";
import { reportTemplateIdForScope } from "@/widgets/reportFixtures";
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

export const SmartReportRender: FC<SmartReportRenderProps> = ({ scope, role }) => {
  const { state: chatState } = useChatStore();
  // 2026-05-31-shared-canvas-affordance-restoration — the `✎ edit §N` control
  // drives the render→builder hand-off through the orchestrator (the SAME
  // `editTemplate` intent the `show_smart_report_edit` tool emits), NOT a host
  // callback prop the `{ scope, role }` ScopedCanvas contract can't supply.
  // Soft-optional: no orchestrator (standalone widget tests outside the shell)
  // makes the control a no-op rather than forcing a provider into every mount.
  const orchestrator = useCanvasOrchestratorOptional();

  // The displayed report, once the endpoint has answered. `null` until then
  // (or when the scope has no template / no sections → the empty state).
  const [report, setReport] = useState<RenderedReport | null>(null);
  // First-paint lifecycle: `loading` while the initial render call is in
  // flight, `ready` once a report (with sections) is shown, `empty` when the
  // endpoint returns no renderable report for the scope, `error` when the
  // initial call rejected (retryable). The `↻ re-render` lifecycle is the
  // separate `rerenderState` below — both drive the SAME `runRender` fetch.
  const [firstPaintState, setFirstPaintState] = useState<
    "loading" | "ready" | "empty" | "error"
  >("loading");
  // Re-render lifecycle (a later ↻ click). `idle` after first paint;
  // `rerendering` while the POST is in flight; `error` on a rejected call.
  const [rerenderState, setRerenderState] = useState<"idle" | "rerendering" | "error">("idle");

  const canEdit = widgetRoleCanEdit(role);

  // ── The one fetch path ──────────────────────────────────────────────
  // Initial paint AND ↻ re-render both call this — the surface has a single
  // source of truth for "what the report is" (the render endpoint), MOCK_MODE-
  // backed server-side. `phase` selects which lifecycle state machine to drive
  // (the first paint vs. a later re-render) so the loading/error affordances
  // stay distinct, but the network call + response handling are identical.
  const runRender = useCallback(
    async (renderScope: ContentScope, phase: "first-paint" | "rerender") => {
      const chatSessionId = chatState.activeSessionId;
      const templateId = reportTemplateIdForScope(renderScope);
      if (phase === "first-paint") {
        // No template for this scope (or no session yet) → empty state, no
        // network round-trip.
        if (!templateId || !chatSessionId) {
          setReport(null);
          setFirstPaintState("empty");
          return;
        }
        setFirstPaintState("loading");
      } else {
        if (rerenderState === "rerendering") return;
        const rerenderTemplateId = report?.templateId ?? templateId;
        if (!chatSessionId || !rerenderTemplateId) return;
        setRerenderState("rerendering");
        try {
          const result = await renderReport({ templateId: rerenderTemplateId, scope: renderScope, chatSessionId });
          if (result.gated) {
            // A BYO scope returns the sign-in gate envelope — leave the current
            // (sample) report in place; the builder Save path owns gate opening.
            setRerenderState("idle");
            return;
          }
          setReport(result.report);
          setRerenderState("idle");
        } catch {
          setRerenderState("error");
        }
        return;
      }

      try {
        const result = await renderReport({ templateId, scope: renderScope, chatSessionId });
        if (result.gated) {
          // A BYO scope returns the sign-in gate — there is no sample report to
          // fall back to on first paint, so show the empty state.
          setReport(null);
          setFirstPaintState("empty");
          return;
        }
        if (result.report.sections.length === 0) {
          setReport(null);
          setFirstPaintState("empty");
          return;
        }
        setReport(result.report);
        setFirstPaintState("ready");
        setRerenderState("idle");
      } catch {
        setFirstPaintState("error");
      }
    },
    [chatState.activeSessionId, rerenderState, report],
  );

  // ScopedViewerWidget adaptation: route the FIRST paint — and any re-scope —
  // through the render endpoint (`runRender`), not a synchronous fixture read.
  // `useScopeAdapter` re-runs only on a scope-identity change (not every
  // render), so this is the load-bearing initial-data path.
  useScopeAdapter(scope, (nextScope) => {
    void runRender(nextScope, "first-paint");
  });

  // ↻ re-render — re-runs the template over the current scope and swaps in the
  // endpoint response (round-trip closed). Shares `runRender` with first paint.
  const handleRerender = useCallback(() => {
    void runRender(scope, "rerender");
  }, [runRender, scope]);

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
      {firstPaintState === "loading" ? (
        <Box
          data-testid="smart-report-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
          sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION, p: 2 }}
        >
          Rendering report…
        </Box>
      ) : firstPaintState === "error" ? (
        <Stack
          data-testid="smart-report-error"
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ p: 2 }}
        >
          <Box
            component="span"
            sx={{ color: CORAL, fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL }}
          >
            Couldn’t render the report — try again.
          </Box>
          <Box
            component="button"
            type="button"
            data-testid="smart-report-retry"
            aria-label="Retry rendering report"
            onClick={() => void runRender(scope, "first-paint")}
            sx={{
              border: `1px solid ${BORDER}`,
              background: "none",
              cursor: "pointer",
              color: NAVY,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              borderRadius: BORDER_RADIUS_2X,
              px: 1.25,
              py: 0.5,
              "&:focus-visible": { outline: `2px solid ${NAVY}` },
            }}
          >
            ↻ retry
          </Box>
        </Stack>
      ) : report == null ? (
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
                    pre-selected, by dispatching the `editTemplate` intent
                    through the orchestrator (the same intent
                    `show_smart_report_edit` emits → advanceFrame("f4a", {
                    selectedReportSectionId })). Rendered for every role; whether
                    the edit *persists* is gated at the builder Save boundary. */}
                <Box
                  component="button"
                  type="button"
                  data-testid={`report-section-edit-${section.sectionId}`}
                  aria-label={`Edit section ${i + 1}`}
                  onClick={() =>
                    orchestrator?.dispatch(
                      {
                        kind: "editTemplate",
                        templateId: report.templateId,
                        selectedSectionId: section.sectionId,
                      },
                      "user",
                    )
                  }
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

          {/* ↻ re-render — the production client caller of the render
              endpoint. Re-runs the template over the current scope and swaps in
              the endpoint response (round-trip closed). */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              component="button"
              type="button"
              data-testid="smart-report-rerender"
              aria-label="Re-render report"
              aria-busy={rerenderState === "rerendering" || undefined}
              disabled={rerenderState === "rerendering"}
              onClick={handleRerender}
              sx={{
                border: `1px solid ${BORDER}`,
                background: "none",
                cursor: rerenderState === "rerendering" ? "wait" : "pointer",
                color: NAVY,
                fontSize: FONT_SIZE_LABEL,
                fontWeight: FONT_WEIGHT_LABEL,
                borderRadius: BORDER_RADIUS_2X,
                px: 1.25,
                py: 0.5,
                opacity: rerenderState === "rerendering" ? 0.6 : 1,
                "&:focus-visible": { outline: `2px solid ${NAVY}` },
              }}
            >
              {rerenderState === "rerendering" ? "↻ rendering…" : "↻ render"}
            </Box>
            {rerenderState === "error" ? (
              <Box
                component="span"
                data-testid="smart-report-rerender-error"
                sx={{ color: CORAL, fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL }}
              >
                Re-render failed — try again.
              </Box>
            ) : null}
          </Stack>

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
