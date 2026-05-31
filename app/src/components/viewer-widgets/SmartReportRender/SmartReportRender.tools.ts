/**
 * SmartReportRender — LLM tool declarations (2026-05-29-smart-report-screen
 * Phase 5).
 *
 * The canvas-dispatch tool for the Report **render** surface (f4 / S3). Per the
 * agent-tools spec, `show_` is the canonical canvas-dispatch verb for every
 * ScopedViewerWidget (allowlisted ONCE in `check-tool-quality` by this phase).
 *
 * `show_smart_report_render({ template_id?, scope })` is a `read`-category
 * navigation tool — it moves the canvas to the render surface for a scope. Its
 * `_edit` sibling (`show_smart_report_edit`, opens the builder) lives on
 * `SmartReportBuilder.tools.ts`.
 *
 * Interim AgentToolBus bridge: the handler returns the SAME `showReport`
 * `CanvasIntent` the step-strip pill / "make me a report" path dispatches, so
 * the tool drives the identical canvas move as the on-screen control.
 */
import { z } from "zod";

import { contentScopeSchema } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";
import { defineScopedViewerWidget } from "@/widgets/scopedViewerWidget";

const showSmartReportRender: WidgetTool = {
  name: "show_smart_report_render",
  description:
    "Move the canvas to the Report render surface (frame f4) for a scope. Use when " +
    "the user asks to see the report, says \"make me a report\", or you've reasoned a " +
    "rendered IC-brief is the natural next surface for what they're analyzing.",
  category: "read",
  input: z.object({
    scope: contentScopeSchema.describe(
      "The render-time ContentScope (bucket+filter / documents / group) the report renders over — inherited from the surface the user transitioned from.",
    ),
    template_id: z
      .string()
      .min(1)
      .optional()
      .describe("Optional report template id; defaults to the active draft template when omitted."),
  }),
  handler: (input) => ({
    kind: "showReport",
    templateId: input.template_id ?? "draft",
    scope: input.scope,
  }),
  availableSteps: ["report", "extract-workbench", "interact-chat", "doc-viewer"],
};

export const tools: WidgetTool[] = [showSmartReportRender];

/**
 * ScopedViewerWidget descriptor for the Report RENDER surface — the
 * `report` canvas kind (the builder is the separate `report-builder`
 * kind on `SmartReportBuilder.tools.ts`). Registered into the production
 * singleton so `<ScopedCanvas>` mounts `SmartReportRender` for `report`
 * steps.
 */
export const descriptor = defineScopedViewerWidget({
  id: "smart-report-render",
  kind: "report",
  slot: "viewer-widgets",
  tools,
});
