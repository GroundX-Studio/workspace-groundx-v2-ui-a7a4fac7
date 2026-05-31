/**
 * ScopedViewerWidget registry — the enumerable set of viewer-widget
 * MOUNTS. core data-model hardening, Item 5/7.
 *
 * Conforms to the shared `Catalog<T>` read contract (`@groundx/shared`):
 * `all()` enumerates in stable insertion order, `byId()` looks one up.
 * It is a local (static) catalog, so it enforces the unique-id invariant
 * at construction through the shared `assertUniqueIds` helper (the ONE
 * mechanism for that invariant — no bespoke duplicate check).
 *
 * ✅ WIRED + LOAD-BEARING (2026-05-30-onboarding-shell-shared-view
 * Phase 1, hardened in REFINE) — this factory builds the production
 * singleton (`scopedViewerWidgetRegistryProduction.ts`), which holds the
 * three real viewer-widget MOUNTS (descriptor + component): PdfViewer ·
 * SmartReportRender · SmartReportBuilder. `<ScopedCanvas>` mounts a step's
 * widget by resolving its `CanvasKind` THROUGH this catalog singleton
 * (`componentForKind` → catalog entry → `.component`), so the catalog's
 * output is on the live render path — not a parallel dormant structure.
 * `OnboardingShell` mounts `<ScopedCanvas>`. That discharges the core-data
 * "OUTSTANDING — the base is ORPHANED; wire it up" ticket. This module
 * keeps shipping just the generic catalog factory + read contract; the
 * production singleton + the one-mount-per-declared-`CanvasKind` totality
 * assertion live in the production module so the factory stays
 * widget-agnostic.
 *
 * The factory is generic over the catalog item `T` with an explicit
 * `idOf` accessor: the descriptor catalog keys by `d.id`, the production
 * mount catalog keys by `m.descriptor.id`. Same one mechanism, one axis
 * (the id accessor), no fork.
 */
import { assertUniqueIds, type Catalog } from "@groundx/shared";

/**
 * Build a `Catalog<T>` from a list of items + an id accessor. Throws (via
 * the shared `assertUniqueIds`) if two items share an id, naming the
 * duplicate. The defensive copy means callers can't mutate the catalog's
 * backing array.
 */
export function createScopedViewerWidgetRegistry<T>(
  items: readonly T[],
  idOf: (item: T) => string,
): Catalog<T> {
  assertUniqueIds(items, idOf);

  const byId = new Map<string, T>();
  for (const item of items) byId.set(idOf(item), item);

  const all = Object.freeze([...items]);

  return {
    all: () => all,
    byId: (id) => byId.get(id),
  };
}
