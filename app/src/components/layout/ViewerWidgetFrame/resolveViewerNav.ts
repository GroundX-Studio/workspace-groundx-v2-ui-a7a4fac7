/**
 * resolveViewerNav — the SINGLE place that turns a surface context into the
 * frame's eyebrow/title/subtitle. Pure: no React, no DOM, no fetching. Replaces
 * the (unused) `framePropsFromDescriptor` merge helper — there is exactly one
 * descriptor-merge path.
 *
 * 2026-06-16 viewer-nav-redesign.
 *  - onboarding-step: eyebrow + title from the shared journey catalog (eyebrow
 *    values are mixed-case; the Label eyebrow variant uppercases via CSS).
 *  - steady-canvas: NO eyebrow (deferred — task_3c2aace6); title = the document
 *    name for the doc viewer, else the widget's intrinsic title.
 * Overlays (sign-up / book-call) do NOT come through here — they render their
 * own static descriptor directly.
 *
 * `chromePolicy`/`contentMode` ALWAYS come from `defaults`; any field a context
 * does not set falls back to `defaults`, so the header never renders blank.
 */
import { JOURNEY_CATALOG } from "@/components/layout/StepStrip/journeyCatalog";

import type { ViewerFrameDescriptor } from "./viewerFrameDescriptor";
import type { ViewerNavContext } from "./viewerNavContext";

/** Placeholder title shown while a document name is still resolving. */
export const DOCUMENT_NAME_PLACEHOLDER = "Document";

export function resolveViewerNav(
  ctx: ViewerNavContext,
  defaults: ViewerFrameDescriptor,
): ViewerFrameDescriptor {
  const base = { chromePolicy: defaults.chromePolicy, contentMode: defaults.contentMode };

  switch (ctx.kind) {
    case "onboarding-step": {
      const entry = JOURNEY_CATALOG[ctx.step];
      // `?.` (not `!`): a substep on a step that has none degrades to the step's
      // own title / the document name / the placeholder — never throws.
      const substepTitle = ctx.substep ? entry.substeps?.[ctx.substep]?.title : undefined;
      const title = substepTitle ?? entry.title ?? ctx.documentName ?? DOCUMENT_NAME_PLACEHOLDER;
      return { ...base, eyebrow: entry.eyebrow, title, subtitle: defaults.subtitle };
    }
    case "steady-canvas": {
      // No eyebrow in steady (deferred). doc-viewer titles with the document name.
      const title =
        ctx.widget === "doc-viewer"
          ? (ctx.documentName ?? DOCUMENT_NAME_PLACEHOLDER)
          : defaults.title;
      return { ...base, title, subtitle: defaults.subtitle };
    }
    default: {
      const _exhaustive: never = ctx;
      void _exhaustive;
      return defaults;
    }
  }
}
