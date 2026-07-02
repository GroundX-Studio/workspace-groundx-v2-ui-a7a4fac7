/**
 * SmartReportRender — the Report render surface (the `report` step's
 * `surface: "render"` sub-position; S3 in the spec).
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
 * (2026-05-31-smart-report-followups closes that round-trip; the server runs
 * the live render path, so the displayed sections come from the endpoint). The first
 * paint has an explicit lifecycle — `loading` (fetch in flight) → `ready`
 * (endpoint response shown) / `empty` (endpoint returned no sections) /
 * `error` (the call rejected, with a retry). `useScopeAdapter` re-runs the
 * SAME fetch on a scope-identity change. The live multi-doc fan-out is Phase 7
 * (BLOCKED on WF-10) — the same endpoint serves it with no surface rework.
 *
 * The template id the first paint renders is resolved from REAL report state
 * (`reportOverlay.templateId` on the active chat session) — NEVER from a
 * client-side scope→fixture map. When no template id is set (the new-customer
 * norm, `Pin→template = NO auto`), the surface shows the empty state without a
 * network round-trip.
 *
 * Per `widget-role-access`: `role: WidgetRole` is the authorization axis.
 * Export / Save are locked-for-anonymous (`widgetRoleCanEdit`); a sample-doc
 * render is `preview_only` (#9). The `✎ edit §N` affordance per heading dispatches
 * the `editTemplate` CanvasIntent through the orchestrator (the same intent the
 * `show_smart_report_edit` tool emits), routing to the builder surface with the
 * section pre-selected — no host callback prop (the `{ scope, role }` ScopedCanvas
 * contract can't supply one).
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type FC, useCallback, useEffect, useRef, useState } from "react";

import type { ContentScope, WidgetRole } from "@groundx/shared";
import { widgetRoleCanEdit } from "@groundx/shared";

import { SourceList } from "@/components/brand/SourceList/SourceList";
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
import { useApi } from "@/contexts/ApiContext";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";
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
  const {
    report: { renderReportStream },
  } = useApi();
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

  // progressive-report-render B3 — streaming fill-in state. `orderedIds` is the
  // template-order slot layout (from the `meta` frame); a slot renders its
  // arrived section or a per-slot loading placeholder. `failedIds` marks slots
  // the server couldn't generate — each shows a "retry §N" affordance (shown to
  // EVERY role) and, while non-empty, gates Save/Export (completeness gate).
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  // Section id currently being re-fetched via the per-section retry affordance.
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const canEdit = widgetRoleCanEdit(role);

  // DL-4 (e2e-experience-audit): a pinned answer lands in the session's
  // `reportOverlay` as a draft section (Pin→template = NO auto — it does NOT
  // create a saved template or auto-open the builder). When the scope has no
  // rendered report but a draft exists, the empty state surfaces a reachable
  // "open builder" affordance so the draft isn't orphaned (otherwise it's
  // reachable only via an LLM `show_smart_report_edit` tool-call).
  const activeSession =
    chatState.activeSessionId != null ? chatState.sessions.get(chatState.activeSessionId) : undefined;
  const draftSectionCount = activeSession?.reportOverlay.addedFields.length ?? 0;
  // The template id to render is the active session's REAL report state — never
  // a client-side scope→fixture map. `null` (the new-customer norm) → the empty
  // state with no network round-trip. (Onboarding sets this for the utility
  // scenario in the `report-default-template` change; here it is simply absent.)
  const overlayTemplateId = activeSession?.reportOverlay.templateId ?? null;

  // ── The one fetch path ──────────────────────────────────────────────
  // Initial paint AND ↻ re-render both call this — the surface has a single
  // source of truth for "what the report is" (the render endpoint), served by
  // the live render path server-side. `phase` selects which lifecycle state machine to drive
  // (the first paint vs. a later re-render) so the loading/error affordances
  // stay distinct, but the network call + response handling are identical.
  const runRender = useCallback(
    (renderScope: ContentScope, phase: "first-paint" | "rerender") => {
      const chatSessionId = chatState.activeSessionId;
      const templateId = phase === "rerender" ? (report?.templateId ?? overlayTemplateId) : overlayTemplateId;
      // No template for this scope (or no session yet) → empty state on first
      // paint (no round-trip); a re-render with nothing to render is a no-op.
      if (!templateId || !chatSessionId) {
        if (phase === "first-paint") {
          setReport(null);
          setOrderedIds([]);
          setFirstPaintState("empty");
        }
        return;
      }
      if (phase === "rerender" && rerenderState === "rerendering") return;
      if (phase === "first-paint") setFirstPaintState("loading");
      else setRerenderState("rerendering");
      setFailedIds(new Set());

      // Progressive streaming (B3): sections fill template-order slots as they
      // complete; first paint and ↻ re-render share this one path.
      let terminalHandled = false;
      void renderReportStream(
        { templateId, scope: renderScope, chatSessionId },
        {
          onMeta: (ids) => {
            setOrderedIds(ids);
            // Skeleton so the slot frame renders while sections stream in; the
            // envelope-level fields (previewOnly / exportFormats) land on `done`.
            setReport({
              reportId: `rr-${templateId}`,
              templateId,
              scope: renderScope,
              status: "streaming",
              sections: [],
              resolvedVariables: {},
              exportFormats: [],
              previewOnly: true,
            });
            if (phase === "first-paint") setFirstPaintState("ready");
            setRerenderState("idle");
          },
          onSection: (section, _index, failed) => {
            // Upsert by id; the JSX orders by `orderedIds`, so arrival order is free.
            setReport((prev) =>
              prev
                ? { ...prev, sections: [...prev.sections.filter((s) => s.sectionId !== section.sectionId), section] }
                : prev,
            );
            if (failed) setFailedIds((prev) => new Set(prev).add(section.sectionId));
          },
          onDone: (result) => {
            terminalHandled = true;
            if (result.gated) {
              // BYO gate: first paint has no sample to fall back to → empty; a
              // re-render leaves the current report in place.
              if (phase === "first-paint") {
                setReport(null);
                setOrderedIds([]);
                setFirstPaintState("empty");
              }
              setRerenderState("idle");
              return;
            }
            const r = result.report;
            if (r.sections.length === 0 && phase === "first-paint") {
              setReport(null);
              setOrderedIds([]);
              setFirstPaintState("empty");
              setRerenderState("idle");
              return;
            }
            // Finalize envelope-level fields (progressive sections already set).
            setReport((prev) =>
              prev
                ? { ...prev, status: r.status, previewOnly: r.previewOnly, exportFormats: r.exportFormats, resolvedVariables: r.resolvedVariables }
                : r,
            );
            if (phase === "first-paint") setFirstPaintState("ready");
            setRerenderState("idle");
          },
          onError: () => {
            if (terminalHandled) return;
            if (phase === "first-paint") setFirstPaintState("error");
            else setRerenderState("error");
          },
        },
      );
    },
    [chatState.activeSessionId, overlayTemplateId, rerenderState, report, renderReportStream],
  );

  // Per-section retry (shown for EVERY role, Q1) — re-render just this section
  // via the `section_ids` subset over the streaming path; the other slots are
  // untouched. Clears the slot's failed flag on success.
  const handleRetrySection = useCallback(
    (sectionId: string) => {
      const chatSessionId = chatState.activeSessionId;
      const templateId = report?.templateId;
      if (!chatSessionId || !templateId || retryingId) return;
      setRetryingId(sectionId);
      void renderReportStream(
        { templateId, scope, chatSessionId, sectionIds: [sectionId] },
        {
          onSection: (section, _index, failed) => {
            setReport((prev) =>
              prev
                ? { ...prev, sections: [...prev.sections.filter((s) => s.sectionId !== section.sectionId), section] }
                : prev,
            );
            setFailedIds((prev) => {
              const next = new Set(prev);
              if (failed) next.add(section.sectionId);
              else next.delete(section.sectionId);
              return next;
            });
          },
          onDone: () => setRetryingId(null),
          onError: () => setRetryingId(null),
        },
      );
    },
    [chatState.activeSessionId, report, retryingId, renderReportStream, scope],
  );

  // Retry ALL failed sections at once (the completeness-gate reload affordance).
  const handleRetryAllFailed = useCallback(() => {
    const chatSessionId = chatState.activeSessionId;
    const templateId = report?.templateId;
    const ids = [...failedIds];
    if (!chatSessionId || !templateId || retryingId || ids.length === 0) return;
    setRetryingId("__all__");
    void renderReportStream(
      { templateId, scope, chatSessionId, sectionIds: ids },
      {
        onSection: (section, _index, failed) => {
          setReport((prev) =>
            prev
              ? { ...prev, sections: [...prev.sections.filter((s) => s.sectionId !== section.sectionId), section] }
              : prev,
          );
          setFailedIds((prev) => {
            const next = new Set(prev);
            if (failed) next.add(section.sectionId);
            else next.delete(section.sectionId);
            return next;
          });
        },
        onDone: () => setRetryingId(null),
        onError: () => setRetryingId(null),
      },
    );
  }, [chatState.activeSessionId, report, failedIds, retryingId, renderReportStream, scope]);

  // ScopedViewerWidget adaptation: route the FIRST paint — and any re-scope —
  // through the render endpoint (`runRender`), not a synchronous fixture read.
  // `useScopeAdapter` re-runs only on a scope-identity change (not every
  // render), so this is the load-bearing initial-data path.
  useScopeAdapter(scope, (nextScope) => {
    void runRender(nextScope, "first-paint");
  });

  // The template id is read from report STATE, which can arrive AFTER mount —
  // a pin sets it, or the onboarding bootstrap (report-default-template) sets it
  // for the utility scenario. `useScopeAdapter` only drives first paint on mount
  // + scope-identity change, so without this the surface would stay empty when
  // the template id lands late. Re-run first paint when `overlayTemplateId`
  // changes (the ref skips the mount value so the two triggers don't
  // double-fire). Closes the report-default-template re-trigger concern.
  const lastTemplateIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastTemplateIdRef.current === undefined) {
      lastTemplateIdRef.current = overlayTemplateId;
      return;
    }
    if (lastTemplateIdRef.current === overlayTemplateId) return;
    lastTemplateIdRef.current = overlayTemplateId;
    void runRender(scope, "first-paint");
  }, [overlayTemplateId, scope, runRender]);

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
        <Stack
          data-testid="smart-report-empty"
          spacing={1.5}
          sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION, p: 2, alignItems: "flex-start" }}
        >
          <Box>
            {draftSectionCount > 0
              ? `You have a report draft in progress — ${draftSectionCount} pinned ${
                  draftSectionCount === 1 ? "answer" : "answers"
                }. Open the builder to shape it into a report.`
              : "No report for this scope yet. Pin an answer or open the builder to start one."}
          </Box>
          {draftSectionCount > 0 && orchestrator ? (
            <Box
              component="button"
              type="button"
              data-testid="smart-report-open-draft-builder"
              onClick={() =>
                orchestrator.dispatch(
                  {
                    kind: "editTemplate",
                    // The handler routes to the builder surface, which reads the
                    // in-memory `reportOverlay` draft; `templateId` is a required
                    // intent field but unused for an unsaved draft, so route by
                    // the active report state's template id when set, else a sentinel.
                    templateId: overlayTemplateId ?? "report-draft",
                  },
                  "user",
                )
              }
              sx={{
                border: `1px solid ${NAVY}`,
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
              Open builder →
            </Box>
          ) : null}
        </Stack>
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

          {/* progressive-report-render B3 — iterate template-ORDER slots (from the
              `meta` frame). A slot renders its arrived section, a per-slot loading
              placeholder while pending, or a "retry §N" affordance when the server
              couldn't generate it (shown to EVERY role — Q1). */}
          {(orderedIds.length > 0 ? orderedIds : report.sections.map((s) => s.sectionId)).map((sectionId, i) => {
            const section = report.sections.find((s) => s.sectionId === sectionId);
            const isFailed = failedIds.has(sectionId);
            // Pending slot — hasn't streamed in yet and isn't a known failure.
            if (!section && !isFailed) {
              return (
                <Box
                  key={sectionId}
                  data-testid={`report-section-loading-${sectionId}`}
                  role="status"
                  aria-busy="true"
                  aria-live="polite"
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: BORDER_RADIUS_2X,
                    backgroundColor: WARM_OFFWHITE,
                    p: 2,
                    color: BODY_TEXT,
                    fontSize: FONT_SIZE_CAPTION,
                  }}
                >
                  Rendering {humanizeName(sectionId)}…
                </Box>
              );
            }
            return (
              <Box
                key={sectionId}
                data-testid={`report-section-${sectionId}`}
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
                  sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                >
                  <Box
                    component="h3"
                    data-testid={`report-section-heading-${sectionId}`}
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
                      {renderAsGlyph(section?.renderAs ?? "PARAGRAPH")}
                    </Box>
                    {humanizeName(section?.name ?? sectionId)}
                  </Box>
                  {/* ✎ edit §N — opens the builder surface with this section
                      pre-selected via the `editTemplate` intent (same as
                      `show_smart_report_edit`). Rendered for every role; persist is
                      gated at the builder Save boundary. */}
                  <Box
                    component="button"
                    type="button"
                    data-testid={`report-section-edit-${sectionId}`}
                    aria-label={`Edit section ${i + 1}`}
                    onClick={() =>
                      orchestrator?.dispatch(
                        { kind: "editTemplate", templateId: report.templateId, selectedSectionId: sectionId },
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

                {isFailed ? (
                  // Failed slot — a "retry §N" affordance (shown to every role) that
                  // re-renders just this section. The other slots are untouched.
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    data-testid={`report-section-failed-${sectionId}`}
                  >
                    <Box component="span" sx={{ color: CORAL, fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL }}>
                      Couldn’t generate this section.
                    </Box>
                    <Box
                      component="button"
                      type="button"
                      data-testid={`report-section-retry-${sectionId}`}
                      aria-label={`Retry section ${i + 1}`}
                      disabled={retryingId !== null}
                      onClick={() => handleRetrySection(sectionId)}
                      sx={{
                        border: `1px solid ${BORDER}`,
                        background: "none",
                        cursor: retryingId !== null ? "wait" : "pointer",
                        color: NAVY,
                        fontSize: FONT_SIZE_LABEL,
                        fontWeight: FONT_WEIGHT_LABEL,
                        borderRadius: BORDER_RADIUS_2X,
                        px: 1.25,
                        py: 0.5,
                        opacity: retryingId !== null ? 0.6 : 1,
                        "&:focus-visible": { outline: `2px solid ${NAVY}` },
                      }}
                    >
                      {retryingId === sectionId ? "↻ retrying…" : `↻ retry §${i + 1}`}
                    </Box>
                  </Stack>
                ) : (
                  <>
                    <Box sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION }}>
                      <Markdown citations={section?.result.citations ?? []}>{section?.result.body ?? ""}</Markdown>
                    </Box>
                    {section?.result.warnings && section.result.warnings.length > 0 ? (
                      <Box
                        data-testid={`report-section-warnings-${sectionId}`}
                        sx={{ color: EYEBROW_ON_LIGHT, fontSize: FONT_SIZE_LABEL }}
                      >
                        {section.result.warnings.join(" · ")}
                      </Box>
                    ) : null}
                    {section && section.result.citations.length > 0 ? (
                      <SourceList citations={section.result.citations} />
                    ) : null}
                  </>
                )}
              </Box>
            );
          })}

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

          {/* progressive-report-render B3 — completeness gate (Q2). While ANY
              section failed, the report is incomplete → Save/Export are disabled
              and a "N sections failed — retry" reload re-renders all failed
              sections at once. Viewing is never blocked (this is separate from
              the scope-based anon/BYO gate). */}
          {failedIds.size > 0 ? (
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              data-testid="smart-report-incomplete"
            >
              <Box component="span" sx={{ color: EYEBROW_ON_LIGHT, fontSize: FONT_SIZE_LABEL }}>
                {`${failedIds.size} section${failedIds.size === 1 ? "" : "s"} failed — retry to complete the report.`}
              </Box>
              <Box
                component="button"
                type="button"
                data-testid="smart-report-retry-failed"
                aria-label="Retry all failed sections"
                disabled={retryingId !== null}
                onClick={handleRetryAllFailed}
                sx={{
                  border: `1px solid ${NAVY}`,
                  background: "none",
                  cursor: retryingId !== null ? "wait" : "pointer",
                  color: NAVY,
                  fontSize: FONT_SIZE_LABEL,
                  fontWeight: FONT_WEIGHT_LABEL,
                  borderRadius: BORDER_RADIUS_2X,
                  px: 1.25,
                  py: 0.5,
                  opacity: retryingId !== null ? 0.6 : 1,
                  "&:focus-visible": { outline: `2px solid ${NAVY}` },
                }}
              >
                {retryingId === "__all__" ? "↻ retrying…" : "↻ retry failed"}
              </Box>
            </Stack>
          ) : null}

          {/* Export / Save are locked-for-anonymous (#9 / role gate) AND gated on
              a COMPLETE report (Q2 — no failed sections). The control renders for
              both roles; the lock is the disabled state + the preview badge / the
              incomplete notice above. */}
          {(() => {
            const canShip = canEdit && !report.previewOnly && failedIds.size === 0;
            return (
              <Box
                data-testid="smart-report-export"
                aria-disabled={!canShip || undefined}
                sx={{
                  alignSelf: "flex-start",
                  color: canShip ? NAVY : BODY_TEXT,
                  fontSize: FONT_SIZE_LABEL,
                  fontWeight: FONT_WEIGHT_LABEL,
                  opacity: canShip ? 1 : 0.6,
                }}
              >
                {canShip ? "export ▾ · 💾 Save" : "export ▾ 🔒 · 💾 Save 🔒"}
              </Box>
            );
          })()}
        </>
      )}
    </Box>
  );
};

export default SmartReportRender;
