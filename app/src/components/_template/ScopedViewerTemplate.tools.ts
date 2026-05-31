/**
 * ScopedViewerWidget Template — canonical descriptor + canvas-dispatch tool.
 *
 * **COPY THIS FILE** alongside `ScopedViewerTemplate.tsx` into
 * `components/viewer-widgets/<Name>/` and rename to `<Name>.tools.ts`. Unlike the
 * plain `Template.tools.ts` (a chat-card's read/mutate tools), a
 * ScopedViewerWidget ALSO exports a `defineScopedViewerWidget(...)` descriptor —
 * the base "object" the production registry catalogs so `<ScopedCanvas>` can
 * resolve `step.kind → CanvasKind → mount → component`.
 *
 * Contract (enforced by the §5(a) drift guard + `check-tool-quality`):
 *   • Export `tools: WidgetTool[]` with ≥1 canvas-dispatch tool. `show_*` is the
 *     canonical verb (the report family); PdfViewer's `open_`/`jump_` are also
 *     accepted — the verb prefix is policed by `check-tool-quality`, not the
 *     descriptor.
 *   • Export `descriptor = defineScopedViewerWidget({ id, kind, slot, tools })`.
 *     `kind` MUST be a `CanvasKind` (`@groundx/shared`) — the CLOSED set of built
 *     surfaces. Add the kind to `canvasKindSchema` first if it's new.
 *   • Register `{ descriptor, component }` in
 *     `widgets/scopedViewerWidgetRegistryProduction.ts` (the sole mount path).
 *
 * Shared bases (reuse, don't fork): `contentScopeSchema` (`@groundx/shared`),
 * `defineScopedViewerWidget` (`@/widgets/scopedViewerWidget`). See
 * `docs/agents/data-model.md` "New viewer surface" + `template-scope-results.md`.
 */
import { z } from "zod";

import { contentScopeSchema } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";
// NOTE: kept commented in the template so the unused import doesn't trip the
// build before the file is copied + the `kind` wired into `canvasKindSchema`.
// import { defineScopedViewerWidget } from "@/widgets/scopedViewerWidget";

/**
 * Canvas-dispatch tool — moves the canvas to this widget's surface for a scope.
 * `read` category (navigation auto-executes). Replace `show_template_surface`
 * with the real `show_<surface>` and route to the real `CanvasIntent`.
 */
const showTemplateSurface: WidgetTool = {
  name: "show_template_surface",
  description:
    "Move the canvas to the template viewer surface for a scope. Use when the user " +
    "asks to see this surface or you've reasoned it is the natural next view for " +
    "what they're analyzing.",
  category: "read",
  input: z.object({
    scope: contentScopeSchema.describe(
      "The ContentScope (documents / bucket+filter / group) the surface renders over.",
    ),
  }),
  // A real widget returns its canvas-dispatch CanvasIntent (e.g. showExtract).
  handler: () => null,
  availableSteps: ["doc-viewer", "extract-workbench", "interact-chat", "report"],
};

export const tools: WidgetTool[] = [showTemplateSurface];

/**
 * ScopedViewerWidget descriptor — UNCOMMENT + fill in when copying into a real
 * `viewer-widgets/<Name>/` dir (and add `<Name>Kind` to `canvasKindSchema`):
 *
 *   export const descriptor = defineScopedViewerWidget({
 *     id: "<name>-surface",
 *     kind: "<canvas-kind>",      // must be in canvasKindSchema
 *     slot: "viewer-widgets",
 *     tools,
 *   });
 *
 * then register `{ descriptor, component: <Name> }` in
 * `widgets/scopedViewerWidgetRegistryProduction.ts`.
 */
