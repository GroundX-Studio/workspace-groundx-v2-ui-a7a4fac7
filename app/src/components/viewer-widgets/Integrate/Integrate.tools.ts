/**
 * Integrate — LLM tool declarations
 * (2026-05-30-onboarding-shell-shared-view Phase 3b).
 *
 * The canvas-dispatch tool for the connectors/plugins surface (frame f7). Per
 * the agent-tools spec, `show_` is the canonical canvas-dispatch verb for every
 * ScopedViewerWidget (already allowlisted in `check-tool-quality`). It mirrors
 * `show_extraction` / `show_smart_report_render`: a `read`-category navigation
 * tool that MOVES the canvas to the Integrate surface for a scope.
 *
 * Round-trip: the LLM emits `show_integrate` → middleware validates + invokes
 * the `intentBuilder` → result is a `showIntegrate` `CanvasIntent` → the
 * orchestrator's built-in handler routes to `advanceFrame("f7")` (the SAME
 * canvas move the Integrate step-strip pill performs) → `<ScopedCanvas>` mounts
 * the Integrate connectors surface for the `integrate` step.
 */
import { z } from "zod";

import { contentScopeSchema } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";
import { defineScopedViewerWidget } from "@/widgets/scopedViewerWidget";

const showIntegrate: WidgetTool = {
  name: "show_integrate",
  description:
    "Move the canvas to the Integrate surface (frame f7) — the connectors / agent " +
    "plugins + API snippets for shipping this sample into a stack. Use when " +
    "the user asks to integrate, ship, connect an agent (Claude / OpenAI / Gemini / " +
    "Cursor), or get the API / SDK snippet for the content being analyzed.",
  category: "read",
  input: z.object({
    scope: contentScopeSchema.describe(
      "The ContentScope (documents / bucket+filter / group) the user is shipping — inherited from the surface the user transitioned from. The connectors list is scope-independent today, but the scope threads through for context.",
    ),
  }),
  handler: (input) => ({
    kind: "showIntegrate",
    scope: input.scope,
  }),
  availableSteps: ["integrate", "doc-viewer", "extract-workbench", "interact-chat", "report"],
};

export const tools: WidgetTool[] = [showIntegrate];

/**
 * ScopedViewerWidget descriptor for the Integrate connectors surface — the
 * `integrate` canvas kind. Registered into the production singleton
 * (`scopedViewerWidgetRegistryProduction.ts`) so `<ScopedCanvas>` mounts the
 * Integrate widget for `integrate` steps.
 */
export const descriptor = defineScopedViewerWidget({
  id: "integrate",
  kind: "integrate",
  slot: "viewer-widgets",
  tools,
});
