/**
 * Production ScopedViewerWidget registry singleton — coverage.
 *
 * 2026-05-30-onboarding-shell-shared-view Phase 1. This is the module
 * that DISCHARGES the core-data "base is ORPHANED" ticket: it stands up
 * the production registry from the shipped `createScopedViewerWidgetRegistry`
 * factory, holding the real descriptors (PdfViewer · Extract · SmartReportRender ·
 * SmartReportBuilder), and asserts the Direction-1 invariant — exactly one
 * descriptor per DECLARED `CanvasKind`. (Extract joined in
 * 2026-05-30-onboarding-shell-shared-view Phase 3a.)
 *
 * TDD: failing-first. The module under test does not exist yet.
 */
import { describe, expect, it } from "vitest";

import { canvasKindSchema, type CanvasKind } from "@groundx/shared";

import {
  scopedViewerWidgetRegistry,
  componentForKind,
} from "./scopedViewerWidgetRegistryProduction";

describe("scopedViewerWidgetRegistry (production singleton)", () => {
  it("holds the real viewer-widget mounts (descriptor + component)", () => {
    expect(
      scopedViewerWidgetRegistry
        .all()
        .map((m) => m.descriptor.id)
        .sort(),
    ).toEqual(
      ["extract-workbench", "pdf-viewer", "smart-report-builder", "smart-report-render"].sort(),
    );
    // Each catalog entry carries its mountable component — the catalog is the
    // single source of truth for BOTH the descriptor and the component.
    for (const mount of scopedViewerWidgetRegistry.all()) {
      expect(typeof mount.component, `component for "${mount.descriptor.id}"`).toBe(
        "function",
      );
    }
  });

  it("Direction-1: resolves EXACTLY ONE mount per declared CanvasKind", () => {
    const declared = canvasKindSchema.options as readonly CanvasKind[];
    for (const kind of declared) {
      const matches = scopedViewerWidgetRegistry
        .all()
        .filter((m) => m.descriptor.kind === kind);
      expect(matches, `expected exactly one mount for kind "${kind}"`).toHaveLength(1);
      // The keyed lookup returns that same component (the live render path).
      expect(componentForKind(kind)).toBe(matches[0]!.component);
    }
  });

  it("maps each declared kind to the expected widget id (via the catalog)", () => {
    const idForKind = (kind: CanvasKind) =>
      scopedViewerWidgetRegistry.all().find((m) => m.descriptor.kind === kind)!.descriptor.id;
    expect(idForKind("doc-viewer")).toBe("pdf-viewer");
    expect(idForKind("extract-workbench")).toBe("extract-workbench");
    expect(idForKind("report")).toBe("smart-report-render");
    expect(idForKind("report-builder")).toBe("smart-report-builder");
  });

  it("componentForKind resolves THROUGH the catalog singleton (load-bearing)", () => {
    // The component <ScopedCanvas> mounts is the exact component the catalog
    // entry for that kind holds — proving the singleton is the sole resolution
    // path, not a parallel dormant structure.
    for (const kind of canvasKindSchema.options as readonly CanvasKind[]) {
      const viaCatalog = scopedViewerWidgetRegistry
        .all()
        .find((m) => m.descriptor.kind === kind)!.component;
      expect(componentForKind(kind)).toBe(viaCatalog);
    }
  });
});
