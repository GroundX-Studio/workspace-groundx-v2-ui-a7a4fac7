/**
 * Production ScopedViewerWidget registry singleton.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 1 (hardened in REFINE) —
 * this is the module that DISCHARGES the core-data "the base is ORPHANED;
 * wire it up" ticket. It is the FIRST and ONLY production importer of the
 * `createScopedViewerWidgetRegistry` factory + the three viewer-widget
 * descriptors AND components.
 *
 * The singleton is a `Catalog<ScopedViewerWidgetMount>` — each entry pairs
 * a widget's pure descriptor (`kind` + tool SET) with its React component.
 * `<ScopedCanvas>` mounts a step's widget by resolving its `CanvasKind`
 * THROUGH this catalog (`componentForKind(kind)` → `mountForKind(kind)` →
 * `scopedViewerWidgetRegistry.byId(...)` → `.component`). The components
 * are imported HERE and nowhere else outside each widget's own test
 * (enforced by the ESLint `no-restricted-imports` ban on
 * `components/viewer-widgets/*`), so "uncatalogued" == "unreachable".
 *
 * The catalog is therefore LOAD-BEARING: the component `<ScopedCanvas>`
 * renders is the exact `component` field of the catalog entry — there is
 * no parallel `CanvasKind → component` Record. `OnboardingShell` mounts
 * `<ScopedCanvas>`, so the chain `OnboardingShell → ScopedCanvas →
 * componentForKind → scopedViewerWidgetRegistry → mount.component` is the
 * live, sole production canvas mount path.
 *
 * Direction-1 totality: `assertOneMountPerDeclaredKind` runs at module
 * load over the CATALOG itself and throws if any declared `CanvasKind`
 * lacks exactly one mount. Combined with `<ScopedCanvas>`'s `never`-default
 * switch over `CanvasKind`, every DECLARED kind provably resolves to a
 * widget. (Direction-2 — a built-but-uncatalogued widget — has no airtight
 * static catch; the sole-mount-path + import ban are the mitigations.)
 */
import type { FC } from "react";

import { canvasKindSchema, type CanvasKind, type ContentScope, type WidgetRole } from "@groundx/shared";

import { Extract } from "@/components/viewer-widgets/Extract/Extract";
import { descriptor as extractDescriptor } from "@/components/viewer-widgets/Extract/Extract.tools";
import { Integrate } from "@/components/viewer-widgets/Integrate/Integrate";
import { descriptor as integrateDescriptor } from "@/components/viewer-widgets/Integrate/Integrate.tools";
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { descriptor as pdfViewerDescriptor } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget.tools";
import { SmartReportRender } from "@/components/viewer-widgets/SmartReportRender/SmartReportRender";
import { descriptor as smartReportRenderDescriptor } from "@/components/viewer-widgets/SmartReportRender/SmartReportRender.tools";
import { SmartReportBuilder } from "@/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder";
import { descriptor as smartReportBuilderDescriptor } from "@/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.tools";

import type { ScopedViewerWidgetDescriptor } from "./scopedViewerWidget";
import { createScopedViewerWidgetRegistry } from "./scopedViewerWidgetRegistry";

/**
 * The shape `<ScopedCanvas>` mounts every ScopedViewerWidget with. Every
 * widget takes a required `scope: ContentScope` (no raw `documentId` — the
 * widget-role-access scope rule) + a `role: WidgetRole`. Per-widget extra
 * props (PdfViewer's `targetPage`, the builder's `selectedSectionId`) are
 * supplied by the shell when it knows the kind; `<ScopedCanvas>` passes only
 * the universal pair, so this is the lowest common contract.
 */
export interface ScopedViewerWidgetComponentProps {
  scope: ContentScope;
  role: WidgetRole;
}

/**
 * A catalog entry: a widget's pure descriptor paired with the React
 * component `<ScopedCanvas>` mounts for it. The component lives ON the
 * mount (not a side Record) so the catalog is the single source of truth
 * for resolution. Catalog id = `descriptor.id`.
 */
export interface ScopedViewerWidgetMount {
  readonly descriptor: ScopedViewerWidgetDescriptor;
  readonly component: FC<ScopedViewerWidgetComponentProps>;
}

/** The production mount set (insertion order = catalog order). */
const mounts: readonly ScopedViewerWidgetMount[] = [
  { descriptor: pdfViewerDescriptor, component: PdfViewerWidget },
  { descriptor: extractDescriptor, component: Extract },
  { descriptor: smartReportRenderDescriptor, component: SmartReportRender },
  { descriptor: smartReportBuilderDescriptor, component: SmartReportBuilder },
  { descriptor: integrateDescriptor, component: Integrate },
];

/**
 * The production `Catalog<ScopedViewerWidgetMount>` singleton — keyed by
 * `descriptor.id`. This is the sole structure `componentForKind` resolves
 * through.
 */
export const scopedViewerWidgetRegistry = createScopedViewerWidgetRegistry(
  mounts,
  (m) => m.descriptor.id,
);

/**
 * Direction-1 totality assertion — exactly one CATALOG mount per DECLARED
 * `CanvasKind`. Runs once at module load over the catalog singleton itself
 * (not a side array) so a registration drift fails fast at boot, not at a
 * runtime canvas swap.
 */
function assertOneMountPerDeclaredKind(): void {
  for (const kind of canvasKindSchema.options as readonly CanvasKind[]) {
    const matches = scopedViewerWidgetRegistry
      .all()
      .filter((m) => m.descriptor.kind === kind);
    if (matches.length !== 1) {
      throw new Error(
        `ScopedViewerWidget registry: CanvasKind "${kind}" must map to exactly one ` +
          `mount, found ${matches.length}.`,
      );
    }
  }
}

assertOneMountPerDeclaredKind();

/** The catalog mount for a declared `CanvasKind` (totality-guaranteed). */
function mountForKind(kind: CanvasKind): ScopedViewerWidgetMount {
  const match = scopedViewerWidgetRegistry.all().find((m) => m.descriptor.kind === kind);
  // Unreachable given the construction-time assertion above; the throw keeps
  // the return type non-optional for the `<ScopedCanvas>` switch.
  if (!match) throw new Error(`No ScopedViewerWidget mount for CanvasKind "${kind}".`);
  return match;
}

/** The component for a declared `CanvasKind` (resolved through the catalog). */
export function componentForKind(kind: CanvasKind): FC<ScopedViewerWidgetComponentProps> {
  return mountForKind(kind).component;
}
