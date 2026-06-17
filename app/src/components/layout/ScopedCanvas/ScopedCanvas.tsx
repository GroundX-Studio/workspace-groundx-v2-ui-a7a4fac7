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
import { useState, type FC } from "react";

import type { CanvasKind, ContentScope, WidgetRole } from "@groundx/shared";

import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Heading } from "@/components/primitives/Heading/Heading";
import { ViewerWidgetFrame } from "@/components/layout/ViewerWidgetFrame/ViewerWidgetFrame";
import { resolveViewerNav } from "@/components/layout/ViewerWidgetFrame/resolveViewerNav";
import type { ViewerNavContext } from "@/components/layout/ViewerWidgetFrame/viewerNavContext";
import { useDocumentName } from "@/components/layout/ViewerWidgetFrame/useDocumentName";
import { INGEST_LIVE_LABEL, VIEWER_STEP_TO_JOURNEY } from "@/components/layout/StepStrip/journeyCatalog";
import { BORDER_RADIUS_CARD, NAVY, WARM_OFFWHITE, WHITE } from "@/constants";
import type { ViewerStep } from "@/contexts/ChatStoreContext";
import { mountForKind } from "@/widgets/scopedViewerWidgetRegistryProduction";

/** Which shell mounted this canvas — drives whether the nav shows journey words. */
export type ViewerExperience = "onboarding" | "steady";

export interface ScopedCanvasProps {
  /** The active content scope the mounted widget renders over. */
  scope: ContentScope;
  /** The active viewer step — its `kind` selects the widget. */
  step: ViewerStep;
  /** Widget-contract authorization role (`anonymous` | `member`). */
  role: WidgetRole;
  /**
   * Legacy disambiguation for route-owned report frame state. A report
   * ViewerStep can now carry `surface`; that payload wins when present.
   */
  reportSurface?: "render" | "builder";
  /** Whether this canvas is the foreground viewer frame. */
  active?: boolean;
  /**
   * Which shell mounted this canvas. `"onboarding"` shows the journey step as
   * the nav eyebrow; `"steady"` shows none. Passed explicitly by every shell
   * (no inference) — the nav's journey-words toggle (NOT the chatExperienceRegistry).
   */
  experience: ViewerExperience;
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
      return (step.surface ?? reportSurface) === "builder" ? "report-builder" : "report";
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

export const ScopedCanvas: FC<ScopedCanvasProps> = ({
  scope,
  step,
  role,
  reportSurface,
  active = true,
  experience,
}) => {
  const kind = stepToCanvasKind(step, reportSurface);

  // Resolve the document name BEFORE any early return (Rules of Hooks). Gate on
  // the STEP kind (`doc-viewer` = Understand / steady doc view), NOT the canvas
  // kind — `interact-chat` also maps to the doc-viewer canvas but shows the
  // "Interact" sub-step title, so it must NOT trigger a name fetch. Take the id
  // from the SCOPE (the resolved GroundX UUID the PdfViewer reads), never the
  // step's id, which can be a scenario placeholder (`scenario:utility`).
  const documentId =
    step.kind === "doc-viewer" && scope.type === "documents" ? scope.documentIds[0] : undefined;
  // Single-source the doc name: the PdfViewer this canvas mounts already fetches
  // the X-Ray (which carries `fileName`) and reports it up here — so the nav opts
  // OUT of `useDocumentName`'s own `getDocument` fetch (`fetchFallback: false`)
  // to avoid a duplicate round-trip. The hook still resolves synchronously from
  // already-loaded state (steady's instant title); the viewer-reported name
  // fills the onboarding gap where state carries no name. Keyed PER id (mirrors
  // the hook's own `fetched` cache) so switching documents can never flash the
  // previous doc's name — only the active id's reported name is read.
  const [viewerNames, setViewerNames] = useState<Record<string, string>>({});
  const documentName =
    useDocumentName(documentId, { fetchFallback: false }) ??
    (documentId ? viewerNames[documentId] : undefined);

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
  let mount: ReturnType<typeof mountForKind>;
  switch (kind) {
    case "doc-viewer":
    case "extract-workbench":
    case "report":
    case "report-builder":
    case "integrate":
      mount = mountForKind(kind);
      break;
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      mount = mountForKind("doc-viewer");
    }
  }
  const Widget = mount.component;

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
          // multi-region-citations P2.1 — the clicked citation's every region,
          // each at its own tier (the viewer lights all on the matching page).
          highlightRegions: step.highlight?.regions ? [...step.highlight.regions] : undefined,
          // "Show all sources" — every citation region, drawn at once.
          litRegions: step.litRegions ? [...step.litRegions] : undefined,
          // WF-01 C5 — the F2 "reading" sweep. Only the F2 doc-viewer step
          // carries `scanning`; cite-jump steps omit it, so the sweep plays
          // exactly during the reading beat and never on a citation jump.
          showScanAnimation: step.scanning ?? false,
          // nav-name single-source — the viewer reports its resolved fileName
          // up (keyed by the active id) so the nav (above) can drop its own
          // duplicate metadata fetch. The widget only reports for the current
          // scope (it drops stale in-flight results), so this id is correct.
          onFileNameResolved: (fileName: string) => {
            if (!documentId) return;
            setViewerNames((prev) =>
              prev[documentId] === fileName ? prev : { ...prev, [documentId]: fileName },
            );
          },
        }
      : {};
  const reportBuilderProps =
    step.kind === "report" && step.selectedSectionId
      ? { selectedSectionId: step.selectedSectionId }
      : {};
  // standardized-viewer-control — forward the extract-workbench step's focused
  // category so the canvas is a pure function of the active step (the widget
  // re-focuses live when a `showExtract` intent mutates/pushes the step).
  const extractProps =
    step.kind === "extract-workbench" && step.focusedCategoryId
      ? { focusedCategoryId: step.focusedCategoryId }
      : {};

  // Nav context: onboarding shows the journey step/sub-step (from the shared
  // catalog); steady shows no eyebrow. The frame chrome is then resolved once,
  // through `resolveViewerNav`, from the widget's intrinsic descriptor.
  const navContext: ViewerNavContext =
    experience === "onboarding"
      ? {
          kind: "onboarding-step",
          ...(VIEWER_STEP_TO_JOURNEY[step.kind] ?? { step: "understand" }),
          documentName,
        }
      : { kind: "steady-canvas", widget: kind, documentName };

  // The F2 ingest beat: show the live "reading" line via the frame's existing
  // loading slot. It coexists with the PdfViewer's in-page scan animation.
  const loading =
    experience === "onboarding" && step.kind === "doc-viewer" && step.scanning
      ? { label: INGEST_LIVE_LABEL }
      : undefined;

  return (
    <Box
      data-testid="scoped-canvas"
      data-canvas-kind={kind}
      sx={{ height: "100%", width: "100%" }}
    >
      <ViewerWidgetFrame
        widgetId={mount.descriptor.id}
        active={active}
        loading={loading}
        {...resolveViewerNav(navContext, mount.descriptor.viewerFrame)}
      >
        <Widget scope={scope} role={role} {...docViewerHighlight} {...reportBuilderProps} {...extractProps} />
      </ViewerWidgetFrame>
    </Box>
  );
};
