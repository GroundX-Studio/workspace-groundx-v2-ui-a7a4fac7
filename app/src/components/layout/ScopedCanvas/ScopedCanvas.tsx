/**
 * <ScopedCanvas> — the experience/scope-driven canvas selector.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 1. This is the SOLE
 * canvas mount path in both shells: it resolves a `ViewerStep` to its
 * `CanvasKind`, looks the widget up in the production ScopedViewerWidget
 * registry, and mounts it with the active `scope` + `role`. No view
 * imports a viewer-widget directly — the ESLint `no-restricted-imports`
 * ban routes every `components/viewer-widgets/*` import through the
 * registry, so "unregistered" == "unreachable".
 *
 * It is NOT a new abstraction — it is the `ScopedViewerWidget` contract
 * (core-data) consumed at the canvas slot. `session.currentFrame` is no
 * longer on the canvas render path; the canvas reacts to the active
 * viewer step.
 *
 * Direction-1 totality: `stepToCanvasKind` maps a step to a `CanvasKind`
 * or `null`. When it returns a `CanvasKind`, the `switch` over it has a
 * `never` default (compiler) and the registry guarantees exactly one
 * descriptor + component per declared kind — so every DECLARED kind
 * provably resolves to a widget. When it returns `null` (`ingest-picker`,
 * the F1 overlay — the ONLY remaining placeholder kind as of Phase 3b,
 * which packaged Integrate), the canvas renders a labelled "not yet
 * available" placeholder rather than crashing. (Gate / book-call surfaces
 * are widget mounts the shell handles, NOT views routed through here.)
 */
import Box from "@mui/material/Box";
import type { FC } from "react";

import type { CanvasKind, ContentScope, WidgetRole } from "@groundx/shared";

import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Heading } from "@/components/primitives/Heading/Heading";
import { BORDER_RADIUS_CARD, NAVY, WARM_OFFWHITE, WHITE } from "@/constants";
import type { ViewerStep } from "@/contexts/ChatStoreContext";
import { componentForKind } from "@/widgets/scopedViewerWidgetRegistryProduction";

export interface ScopedCanvasProps {
  /** The active content scope the mounted widget renders over. */
  scope: ContentScope;
  /** The active viewer step — its `kind` selects the widget. */
  step: ViewerStep;
  /** Widget-contract authorization role (`anonymous` | `member`). */
  role: WidgetRole;
  /**
   * Disambiguates the `report` step kind between the render surface
   * (`report` CanvasKind, default) and the builder (`report-builder`
   * CanvasKind). The `ViewerStep` `report` kind alone can't tell the two
   * apart (f4 vs f4a); the shell supplies this from its frame state.
   */
  reportSurface?: "render" | "builder";
}

/**
 * Map a `ViewerStep` to the `CanvasKind` of the widget that renders it,
 * or `null` when no built widget exists for that step kind.
 *
 *   • doc-viewer        → "doc-viewer"       (PdfViewer)
 *   • interact-chat     → "doc-viewer"       (canvas shows the cited source;
 *                                             the conversation is the chat slot)
 *   • extract-workbench → "extract-workbench" (the packaged Extract workbench)
 *   • report            → "report" | "report-builder" (render vs builder)
 *   • integrate         → "integrate"        (the packaged Integrate connectors)
 *   • ingest-picker     → null (the F1 overlay, NOT a canvas widget)
 */
export function stepToCanvasKind(
  step: ViewerStep,
  reportSurface: "render" | "builder" = "render",
): CanvasKind | null {
  switch (step.kind) {
    case "doc-viewer":
    case "interact-chat":
      return "doc-viewer";
    case "extract-workbench":
      return "extract-workbench";
    case "report":
      return reportSurface === "builder" ? "report-builder" : "report";
    case "integrate":
      return "integrate";
    case "ingest-picker":
      // The F1 ingest picker is rendered by the F1 overlay, NOT a canvas
      // ScopedViewerWidget — the canvas underneath renders the placeholder.
      // This is the ONLY remaining placeholder kind (Phase 3b packaged
      // Integrate).
      return null;
    default: {
      // Exhaustiveness over `ViewerStep["kind"]`: a new step kind must be
      // mapped here (to a CanvasKind or explicitly to `null`).
      const _exhaustive: never = step;
      void _exhaustive;
      return null;
    }
  }
}

export const ScopedCanvas: FC<ScopedCanvasProps> = ({ scope, step, role, reportSurface }) => {
  const kind = stepToCanvasKind(step, reportSurface);

  if (kind === null) {
    return (
      <Box
        data-testid="scoped-canvas-unavailable"
        sx={{
          height: "100%",
          width: "100%",
          backgroundColor: WARM_OFFWHITE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
        aria-label="Canvas"
      >
        <Box
          sx={{
            backgroundColor: WHITE,
            borderRadius: BORDER_RADIUS_CARD,
            p: 4,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          <Heading level="h5" sx={{ color: NAVY, mb: 1 }}>
            This view isn&apos;t available yet
          </Heading>
          <BodyText>
            There&apos;s no canvas widget for this step yet. Pick a document, open the
            report, or continue in chat.
          </BodyText>
        </Box>
      </Box>
    );
  }

  // Direction-1: the registry guarantees a component for every declared
  // CanvasKind (construction-time totality + the `switch` below's `never`
  // default). The `switch` makes the resolution explicit + compiler-checked.
  let Widget: ReturnType<typeof componentForKind>;
  switch (kind) {
    case "doc-viewer":
    case "extract-workbench":
    case "report":
    case "report-builder":
    case "integrate":
      Widget = componentForKind(kind);
      break;
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      Widget = componentForKind("doc-viewer");
    }
  }

  // doc-viewer citation highlight — forward the cited page + bbox + tier off
  // the `doc-viewer` step arm to the PdfViewer mount so a `CiteChip` click
  // round-trips to the cited page + region overlay (RT-01..05). The step is
  // the canonical source (the `gotoDocViewer` sink writes `highlight` +
  // `page`); other step kinds carry no highlight, so the props stay
  // `undefined` and the widgets ignore them.
  const docViewerHighlight =
    step.kind === "doc-viewer"
      ? {
          targetPage: step.highlight?.page ?? step.page ?? null,
          highlightBbox: step.highlight?.bbox ?? null,
          highlightTier: step.highlight?.tier,
          // "Show all sources" — every citation region, drawn at once.
          litRegions: step.litRegions ? [...step.litRegions] : undefined,
          // WF-01 C5 — the F2 "reading" sweep. Only the F2 doc-viewer step
          // carries `scanning`; cite-jump steps omit it, so the sweep plays
          // exactly during the reading beat and never on a citation jump.
          showScanAnimation: step.scanning ?? false,
        }
      : {};

  return (
    <Box
      data-testid="scoped-canvas"
      data-canvas-kind={kind}
      sx={{ height: "100%", width: "100%" }}
    >
      <Widget scope={scope} role={role} {...docViewerHighlight} />
    </Box>
  );
};
