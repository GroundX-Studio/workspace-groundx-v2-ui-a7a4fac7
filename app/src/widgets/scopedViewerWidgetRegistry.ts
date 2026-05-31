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
 * The four viewer widgets (PdfViewer · Extract · SmartReport · Integrate)
 * register their descriptors here in a LATER step. The production
 * singleton is intentionally NOT created in this module yet — wiring the
 * real four descriptors is step 8. This module ships the factory + the
 * read contract so that wiring lands against a fixed base.
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
