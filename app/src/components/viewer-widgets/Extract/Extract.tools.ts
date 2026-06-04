/**
 * Extract — LLM tool declarations
 * (2026-05-30-onboarding-shell-shared-view Phase 3a).
 *
 * The canvas-dispatch tool for the extraction workbench (frame f3). Per the
 * agent-tools spec, `show_` is the canonical canvas-dispatch verb for every
 * ScopedViewerWidget (already allowlisted in `check-tool-quality`). This is
 * the FIRST extract canvas-dispatch tool — it mirrors `show_smart_report_render`:
 * a `read`-category navigation tool that MOVES the canvas to the extraction
 * workbench for a scope.
 *
 * Round-trip: the LLM emits `show_extraction` → middleware validates +
 * invokes the `intentBuilder` → result is a `showExtract` `CanvasIntent` →
 * the orchestrator's built-in handler routes to `advanceFrame("f3")` (the
 * SAME canvas move the Extract step-strip sub-pill performs) → `<ScopedCanvas>`
 * mounts the Extract workbench for the `extract-workbench` step.
 */
import { z } from "zod";

import { contentScopeSchema } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";
import { defineScopedViewerWidget } from "@/widgets/scopedViewerWidget";

const showExtraction: WidgetTool = {
  name: "show_extraction",
  description:
    "Move the canvas to the extraction workbench (frame f3) for a scope. Use when " +
    "the user asks to see the extracted fields, says \"show the extraction\", or you've " +
    "reasoned the structured-field view is the natural next surface for what they're analyzing.",
  category: "read",
  input: z.object({
    scope: contentScopeSchema.describe(
      "The ContentScope (documents / bucket+filter / group) the workbench extracts over — inherited from the surface the user transitioned from.",
    ),
    schema_id: z
      .string()
      .min(1)
      .optional()
      .describe("Optional extraction template id; defaults to the active draft template when omitted."),
  }),
  availableSteps: ["extract-workbench", "doc-viewer", "interact-chat", "report"],
};

export const tools: WidgetTool[] = [showExtraction];

/**
 * ScopedViewerWidget descriptor for the extraction workbench — the
 * `extract-workbench` canvas kind. Registered into the production singleton
 * (`scopedViewerWidgetRegistryProduction.ts`) so `<ScopedCanvas>` mounts the
 * Extract widget for `extract-workbench` steps.
 */
export const descriptor = defineScopedViewerWidget({
  id: "extract-workbench",
  kind: "extract-workbench",
  slot: "viewer-widgets",
  tools,
});
