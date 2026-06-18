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

import { contentScopeSchema, offerAsField } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";
import { defineScopedViewerWidget } from "@/widgets/scopedViewerWidget";

const showExtraction: WidgetTool = {
  name: "show_extraction",
  description:
    "Move the canvas to the extraction workbench for a scope. Use when " +
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
    // standardized-viewer-control T7 — the offer disposition (one shared node).
    offerAs: offerAsField,
  }),
  // Canvas-NAVIGATION tool — universal, NO availableSteps (Task 7 mirrors the
  // 2026-06-11 server-side decision: navigation tools move the user BETWEEN
  // steps; gating them by the current step defeats their purpose).
};

// standardized-viewer-control T7 — the `_edit` sibling of `show_extraction`,
// mirroring `show_smart_report_edit` (the `_edit` sibling of
// `show_smart_report_render`). Opens the schema DESIGN surface (the
// `surface: "design"` sub-position on the extract-workbench step) by emitting
// `editSchema{schemaId}` — the same intent the in-widget "Edit schema" control
// dispatches. `read`-category navigation; offer-eligible via `offerAs`.
const showExtractionEdit: WidgetTool = {
  name: "show_extraction_edit",
  description:
    "Open the schema editor (the extraction design surface) for a template. Use when the " +
    "user asks to edit the schema, change which fields are extracted, or you want to surface " +
    "the field designer for the active extraction.",
  category: "read",
  input: z.object({
    schema_id: z
      .string()
      .min(1)
      .describe("The extraction template id to open in the schema editor (the active draft when in onboarding)."),
    // standardized-viewer-control T7 — the offer disposition (one shared node).
    offerAs: offerAsField,
  }),
  // Canvas-NAVIGATION tool — universal, NO availableSteps (mirrors the other
  // navigation tools).
};

export const tools: WidgetTool[] = [showExtraction, showExtractionEdit];

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
  viewerFrame: {
    // No `eyebrow`: the viewer nav sources it from the journey catalog in
    // onboarding and leaves it empty in steady (viewer-nav-redesign).
    chromePolicy: "framed",
    // Edge-to-edge: Extract owns its full-width topbar + its own internal
    // scroll container, so the frame must NOT add padding/scroll on top. The
    // redundant `padded-scroll` top-padding was the visible gap between the nav
    // and the topbar buttons.
    contentMode: "edge-to-edge",
    title: "Extract",
    subtitle: "Review structured fields and citations for the active scope.",
  },
  tools,
});
