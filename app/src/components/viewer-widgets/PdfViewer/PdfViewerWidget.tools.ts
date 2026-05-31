/**
 * PdfViewer — LLM tool declarations.
 *
 * widget-llm-integration Phase 4 (2026-05-27): the first real
 * `<Name>.tools.ts` to land. Demonstrates the canonical shape for
 * Phase 7's backfill sweep:
 *
 *   • snake_case names with allowlisted verb prefix (`open_`, `jump_`)
 *   • `Use when …` clause in every description
 *   • per-parameter `.describe()` on the Zod input
 *   • `category: "read"` — both tools auto-execute (navigation only,
 *     no persisted state change)
 *   • `availableSteps` scoped to surfaces where a doc-viewer is
 *     mountable
 *
 * Round-trip: the LLM emits `open_document` → middleware validates +
 * invokes `handler` → result is a `CanvasIntent` → orchestrator
 * dispatches → built-in handler in `CanvasOrchestratorContext`
 * routes to `ChatStore.gotoDocViewer` → viewer pane re-renders. The
 * orchestrator handler for `jumpToPage` was added in Phase 4
 * alongside this file.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";
import { defineScopedViewerWidget } from "@/widgets/scopedViewerWidget";

const openDocument: WidgetTool = {
  name: "open_document",
  description:
    "Open a document in the viewer pane. Use when the user references a document " +
    "by name, asks to see a source, or you are about to cite the document and want " +
    "the source visible while the user reads your answer.",
  category: "read",
  input: z.object({
    documentId: z
      .string()
      .min(1)
      .describe("GroundX document UUID — the canonical identifier returned by ingestion"),
    page: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional 1-indexed page to open at; defaults to page 1 when omitted"),
  }),
  handler: (input) => ({
    kind: "highlightCitation",
    documentId: input.documentId,
    page: input.page ?? 1,
  }),
  // The viewer can mount in onboarding F2 + steady; reachable from
  // any step that renders into the canonical doc-viewer surface.
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
};

const jumpToPage: WidgetTool = {
  name: "jump_to_page",
  description:
    "Jump the active viewer to a specific page of the currently-open document. " +
    "Use when the user references a page number directly (\"go to page 7\") or " +
    "when you've reasoned about a span and want to surface the exact page without " +
    "a region highlight.",
  category: "read",
  input: z.object({
    documentId: z
      .string()
      .min(1)
      .describe("GroundX document UUID — must match the currently-open viewer document"),
    page: z
      .number()
      .int()
      .positive()
      .describe("1-indexed page to scroll to; the viewer renders this page as active"),
  }),
  handler: (input) => ({
    kind: "jumpToPage",
    documentId: input.documentId,
    page: input.page,
  }),
  availableSteps: ["doc-viewer", "interact-chat", "extract-workbench"],
};

export const tools: WidgetTool[] = [openDocument, jumpToPage];

/**
 * ScopedViewerWidget descriptor for the PDF viewer — the `doc-viewer`
 * canvas kind. Carries the widget's full canvas-dispatch tool SET
 * (`open_document` + `jump_to_page`, neither of which is a `show_` verb —
 * the descriptor accepts the full allowlisted verb set; verbs are policed
 * by `check-tool-quality`). Registered into the production singleton
 * (`scopedViewerWidgetRegistryProduction.ts`) so `<ScopedCanvas>` mounts
 * `PdfViewerWidget` for `doc-viewer` steps.
 */
export const descriptor = defineScopedViewerWidget({
  id: "pdf-viewer",
  kind: "doc-viewer",
  slot: "viewer-widgets",
  tools,
});
