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
 *     the descriptor at construction (id present, ≥1 tool) so a
 *     malformed viewer widget fails loudly rather than silently passing
 *     a regex guard. Verb prefixes are policed by `check-tool-quality`,
 *     not here, so a widget's full tool SET (PdfViewer's `open_`/`jump_`
 *     as well as the report family's `show_*`) registers cleanly.
 *   • The descriptor carries the widget's `kind: CanvasKind` + its tool
 *     SET. The catalog factory (`scopedViewerWidgetRegistry.ts`) conforms
 *     to the shared `Catalog<T>` contract; the production singleton
 *     (`scopedViewerWidgetRegistryProduction.ts`) builds a catalog of
 *     MOUNTS (descriptor + component) keyed by `descriptor.id`, and
 *     `<ScopedCanvas>` resolves `step.kind → CanvasKind → catalog mount →
 *     component` THROUGH that singleton (`componentForKind`). The
 *     descriptor's tool SET is surfaced to the LLM tool catalog.
 *   • `scopeKey()` + `useScopeAdapter()` are the scope-prop-handling
 *     primitives the base provides: a viewer widget takes a REQUIRED,
 *     non-`none` `ContentScope` (per widget-role-access rule 6 — these
 *     widgets narrow `WidgetScope`) and re-runs its data load whenever
 *     the scope IDENTITY changes (not on every render).
 *
 * ✅ WIRED + LOAD-BEARING (2026-05-30-onboarding-shell-shared-view
 * Phase 1, hardened in REFINE) — the step-7 "base is ORPHANED" ticket is
 * DISCHARGED here. The production registry singleton
 * (`scopedViewerWidgetRegistryProduction.ts`) is a
 * `Catalog<ScopedViewerWidgetMount>` of three real mounts (descriptor +
 * component): PdfViewer · SmartReportRender · SmartReportBuilder.
 * `<ScopedCanvas>` resolves the component it mounts THROUGH that catalog
 * (`componentForKind(kind)` → `scopedViewerWidgetRegistry.all()` →
 * `mount.component`) — there is no parallel `CanvasKind → component`
 * Record, so the catalog's output is on the live render path.
 * `OnboardingShell` mounts `<ScopedCanvas>`. So the chain `OnboardingShell
 * → ScopedCanvas → componentForKind → registry singleton → these mounts`
 * is a live, non-test production consumer chain.
 * `PdfViewerWidget` now (a) exports a descriptor (`kind: "doc-viewer"`,
 * tools `open_document`/`jump_to_page`) and (b) reloads its X-Ray via
 * `useScopeAdapter(scope, …)` instead of a bespoke `useEffect`. The
 * unbuilt surfaces (`extract-workbench` / `integrate`) are NOT in
 * `CanvasKind`; `<ScopedCanvas>` renders a labelled placeholder for any
 * undeclared step kind. (PdfViewer's raw `documentId` → `{ type:
 * "documents", documentIds: [id] }` collapse landed in widget-role-
 * access Phase 2b.)
 *
 * Anti-overengineering: the "base" is a descriptor + factory + two
 * hooks, NOT a React base class. A viewer widget is a plain function
 * component that (a) accepts `scope: ContentScope`, (b) calls
 * `useScopeAdapter`, and (c) is registered via a descriptor. That keeps
 * the widgets composable with MUI/hooks while still being backed by a
 * real, validated, enumerable object.
 */
import { useEffect, useRef } from "react";

import type { CanvasKind, ContentScope } from "@groundx/shared";

import type { ViewerFrameDescriptor } from "@/components/layout/ViewerWidgetFrame/viewerFrameDescriptor";
import type { WidgetTool } from "@/tools/types";

/** The two widget slots (mirrors the widget-contract directory split). */
export type WidgetSlot = "chat-widgets" | "viewer-widgets";

/**
 * The base "object" every main viewer widget is registered as. Frozen
 * at construction by `defineScopedViewerWidget`. The viewer widgets each
 * export one of these alongside their component, and the production
 * registry (`scopedViewerWidgetRegistryProduction.ts`) pairs each with
 * its component in a catalog mount so `<ScopedCanvas>` can resolve
 * `step.kind → CanvasKind → catalog mount → component`.
 */
export interface ScopedViewerWidgetDescriptor {
  /** Stable registry id (kebab-case widget identity, globally unique). */
  readonly id: string;
  /**
   * The canvas surface this widget IS — the production registry asserts
   * exactly one catalog mount per declared `CanvasKind`, and `<ScopedCanvas>`
   * resolves a step to its widget through this. `CanvasKind` is the CLOSED
   * set of BUILT surfaces (`doc-viewer` / `report` / `report-builder`).
   */
  readonly kind: CanvasKind;
  /** Which widget slot the component lives under. */
  readonly slot: WidgetSlot;
  /** Host-owned viewer chrome metadata consumed by ViewerWidgetFrame. */
  readonly viewerFrame: ViewerFrameDescriptor;
  /**
   * The widget's canvas-dispatch tool SET — every LLM tool this widget
   * owns (e.g. PdfViewer's `open_document` + `jump_to_page`, the report
   * builder's `show_*`/`propose_*`/… family). Surfaced to the LLM catalog
   * by the registry. The verb prefixes are policed by `check-tool-quality`,
   * NOT here — the descriptor accepts the full allowlisted verb set
   * (`open_`/`jump_`/`show_`/…), so PdfViewer's non-`show_` tools register
   * cleanly. A widget MUST declare ≥1 tool (it is, by definition, the set
   * of canvas-dispatch tools the widget exposes).
   */
  readonly tools: readonly WidgetTool[];
}

/** Inputs to {@link defineScopedViewerWidget}. */
export interface ScopedViewerWidgetSpec {
  id: string;
  kind: CanvasKind;
  slot: WidgetSlot;
  viewerFrame: ViewerFrameDescriptor;
  tools: readonly WidgetTool[];
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
  if (!spec.tools || spec.tools.length === 0) {
    throw new Error(
      `ScopedViewerWidget "${spec.id}": \`tools\` must declare at least one canvas-dispatch tool.`,
    );
  }
  return Object.freeze({
    id: spec.id,
    kind: spec.kind,
    slot: spec.slot,
    viewerFrame: Object.freeze({ ...spec.viewerFrame }),
    // Freeze the tools array so the descriptor's set is immutable.
    tools: Object.freeze([...spec.tools]),
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
