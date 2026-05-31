/**
 * ScopedViewerWidget — the real base for the four main viewer widgets
 * (PdfViewer · Extract · SmartReport · Integrate).
 *
 * core data-model hardening, Item 5/7 ("ScopedViewerWidget as a real
 * base class/object"): the widget-contract used to be enforced by a
 * test convention alone. This module makes the base a REAL object/
 * factory:
 *
 *   • `defineScopedViewerWidget()` produces a frozen DESCRIPTOR — the
 *     base "object" each viewer widget is registered as. It validates
 *     the descriptor at construction (id present, `show_*` verb) so a
 *     malformed viewer widget fails loudly rather than silently passing
 *     a regex guard.
 *   • The descriptor carries the widget's `show_*` tool. The descriptor
 *     registry (`scopedViewerWidgetRegistry.ts`) surfaces these to the
 *     LLM tool catalog and conforms to the shared `Catalog<T>` contract.
 *   • `scopeKey()` + `useScopeAdapter()` are the scope-prop-handling
 *     primitives the base provides: a viewer widget takes a REQUIRED,
 *     non-`none` `ContentScope` (per widget-role-access rule 6 — these
 *     widgets narrow `WidgetScope`) and re-runs its data load whenever
 *     the scope IDENTITY changes (not on every render).
 *
 * ⚠️ NOT YET WIRED — this base + `scopeKey`/`useScopeAdapter` +
 * `scopedViewerWidgetRegistry` currently have ZERO production importers.
 * `PdfViewerWidget` was migrated to a required `scope` prop (widget-role-
 * access Phase 2b) but takes `scope` directly and rolls its own reload —
 * it does NOT build on this base, and no production registry singleton
 * exists. Wiring the viewer widgets onto the base + standing up the
 * production registry is an OUTSTANDING ticket — see
 * `openspec/changes/2026-05-29-core-data-model-hardening/tasks.md`
 * ("OUTSTANDING — the base is ORPHANED; wire it up"). Do not treat this
 * module as a live dependency until that lands; the alternative the
 * ticket records is to delete the unused registry if only PdfViewer is
 * needed. (PdfViewer's raw `documentId` → `{ type: "documents",
 * documentIds: [id] }` collapse already landed in widget-role-access
 * Phase 2b; the base is designed to expect a `ContentScope` so the
 * eventual wiring lands consistent with it.)
 *
 * Anti-overengineering: the "base" is a descriptor + factory + two
 * hooks, NOT a React base class. A viewer widget is a plain function
 * component that (a) accepts `scope: ContentScope`, (b) calls
 * `useScopeAdapter`, and (c) is registered via a descriptor. That keeps
 * the widgets composable with MUI/hooks while still being backed by a
 * real, validated, enumerable object.
 */
import { useEffect, useRef } from "react";

import type { ContentScope } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";

/** The two widget slots (mirrors the widget-contract directory split). */
export type WidgetSlot = "chat-widgets" | "viewer-widgets";

/**
 * The base "object" every main viewer widget is registered as. Frozen
 * at construction by `defineScopedViewerWidget`. The four viewer widgets
 * each export one of these alongside their component.
 */
export interface ScopedViewerWidgetDescriptor {
  /** Stable registry id (kebab-case widget identity, globally unique). */
  readonly id: string;
  /** Which widget slot the component lives under. */
  readonly slot: WidgetSlot;
  /**
   * The widget's canvas-dispatch tool — its name MUST start with the
   * `show_` verb (the dispatch-tool taxonomy: `show_*` surfaces the
   * widget at a scope). Surfaced to the LLM catalog by the registry.
   */
  readonly showTool: WidgetTool;
}

/** Inputs to {@link defineScopedViewerWidget}. */
export interface ScopedViewerWidgetSpec {
  id: string;
  slot: WidgetSlot;
  showTool: WidgetTool;
}

/**
 * Construct (and validate + freeze) a ScopedViewerWidget descriptor.
 * Throws on a malformed spec so a broken viewer widget fails at
 * construction, not at runtime — this is the "real object" the spec
 * asks for (structure as source of truth, not a test convention).
 */
export function defineScopedViewerWidget(
  spec: ScopedViewerWidgetSpec,
): ScopedViewerWidgetDescriptor {
  if (!spec.id || spec.id.trim() === "") {
    throw new Error("ScopedViewerWidget: `id` is required and must be non-empty.");
  }
  if (!spec.showTool.name.startsWith("show_")) {
    throw new Error(
      `ScopedViewerWidget "${spec.id}": showTool "${spec.showTool.name}" must use the ` +
        `\`show_\` canvas-dispatch verb (e.g. show_document / show_extract / show_report / ` +
        `show_integrations).`,
    );
  }
  return Object.freeze({
    id: spec.id,
    slot: spec.slot,
    showTool: spec.showTool,
  });
}

/**
 * Stable serialization of a `ContentScope`'s IDENTITY. Two structurally
 * equal scopes (same discriminant + target + composable filter) produce
 * the same key, so the adapter re-runs only on a real scope change.
 *
 * The top-level scope fields have a fixed order, but `filter` is an
 * arbitrary-key record (the composable doc-filter), so we CANNOT rely on
 * `JSON.stringify` key order there — `{a,b}` and `{b,a}` are the same
 * scope. We sort filter keys (and any multi-value arrays + `documentIds`)
 * so identity is insertion-order- and value-order-insensitive.
 */
export function scopeKey(scope: ContentScope): string {
  // Normalize so field-insertion order can't perturb the key. Only the
  // fields that define the scope identity participate.
  const base: Record<string, unknown> = { type: scope.type };
  switch (scope.type) {
    case "bucket":
      base.bucketId = scope.bucketId;
      break;
    case "group":
      base.groupId = scope.groupId;
      break;
    case "documents":
      base.documentIds = [...scope.documentIds].sort();
      break;
  }
  if (scope.filter) {
    // Deterministic, key-order-independent serialization of the filter.
    const sortedFilter: Record<string, unknown> = {};
    for (const field of Object.keys(scope.filter).sort()) {
      const v = (scope.filter as Record<string, unknown>)[field];
      sortedFilter[field] = Array.isArray(v) ? [...v].sort() : v;
    }
    base.filter = sortedFilter;
  }
  return JSON.stringify(base);
}

/**
 * Scope-prop-handling primitive. Runs `adapt(scope)` on mount and again
 * whenever the scope IDENTITY changes (by `scopeKey`), so a viewer
 * widget re-loads its data when re-scoped but not on unrelated re-renders.
 *
 * `adapt` is read through a ref so a fresh closure each render doesn't
 * itself trigger the effect — only a scope-identity change does.
 */
export function useScopeAdapter(
  scope: ContentScope,
  adapt: (scope: ContentScope) => void,
): void {
  const adaptRef = useRef(adapt);
  adaptRef.current = adapt;
  const key = scopeKey(scope);
  useEffect(() => {
    adaptRef.current(scope);
    // Intentionally keyed on the stable scope identity, not the scope
    // object reference (which changes every render) nor `adapt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
