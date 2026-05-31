/**
 * ScopedViewerWidget registry — the enumerable set of viewer-widget
 * descriptors. core data-model hardening, Item 5/7.
 *
 * Conforms to the shared `Catalog<T>` read contract (`@groundx/shared`):
 * `all()` enumerates in stable insertion order, `byId()` looks one up.
 * It is a local (static) catalog, so it enforces the unique-id invariant
 * at construction through the shared `assertUniqueIds` helper (the ONE
 * mechanism for that invariant — no bespoke duplicate check).
 *
 * ⚠️ NOT YET WIRED — no production singleton is built from this factory
 * yet, so this module currently has ZERO production importers (the orphan
 * half of the ScopedViewerWidget base). Step 8 (widget-role-access Phase
 * 2b) did NOT wire it (it only swapped PdfViewer's prop). Standing up the
 * production singleton (PdfViewer now; SmartReport/Extract/Integrate as
 * they are built) is an OUTSTANDING ticket discharged at the
 * `<ScopedCanvas>` step — see
 * `openspec/changes/2026-05-29-core-data-model-hardening/tasks.md`
 * ("OUTSTANDING — the base is ORPHANED; wire it up") +
 * `openspec/changes/2026-05-30-onboarding-shell-shared-view/tasks.md`
 * (Phase 1 "DISCHARGE the core-data ScopedViewerWidget orphan HERE").
 * This module ships only the factory + read contract so wiring lands
 * against a fixed base.
 */
import { assertUniqueIds, type Catalog } from "@groundx/shared";

import type { ScopedViewerWidgetDescriptor } from "./scopedViewerWidget";

/**
 * Build a `Catalog<ScopedViewerWidgetDescriptor>` from a list of viewer
 * widget descriptors. Throws (via `assertUniqueIds`) if two descriptors
 * share an id, naming the duplicate.
 */
export function createScopedViewerWidgetRegistry(
  descriptors: readonly ScopedViewerWidgetDescriptor[],
): Catalog<ScopedViewerWidgetDescriptor> {
  assertUniqueIds(descriptors, (d) => d.id);

  const byId = new Map<string, ScopedViewerWidgetDescriptor>();
  for (const d of descriptors) byId.set(d.id, d);

  // Defensive copy so callers can't mutate the catalog's backing array.
  const all = Object.freeze([...descriptors]);

  return {
    all: () => all,
    byId: (id) => byId.get(id),
  };
}
