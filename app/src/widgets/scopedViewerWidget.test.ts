/**
 * ScopedViewerWidget base — contract tests (core data-model hardening,
 * Item 5/7: "ScopedViewerWidget as a real base class/object").
 *
 * The base is a REAL object/factory (not just an interface): a viewer
 * widget is described by a descriptor produced by
 * `defineScopedViewerWidget()`, which
 *   • requires a real (non-`none`) `ContentScope` at the prop boundary,
 *   • carries a `show_*` tool the registry surfaces to the LLM catalog,
 *   • exposes scope-adaptation primitives (`scopeKey` + `useScopeAdapter`)
 *     so a widget re-runs its data load when its `scope` identity changes.
 *
 * The four viewer widgets (PdfViewer · Extract · SmartReport · Integrate)
 * build on this base in a LATER step — this file only pins the base.
 *
 * TDD: failing-first. The module under test does not exist yet.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ContentScope } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";
import {
  defineScopedViewerWidget,
  scopeKey,
  useScopeAdapter,
  type ScopedViewerWidgetDescriptor,
} from "./scopedViewerWidget";

function mkTool(name: string): WidgetTool {
  return {
    name,
    description: `${name} — drive a scoped viewer surface. Use when the user asks for it.`,
    category: "read",
    input: z.object({
      documentId: z.string().min(1).describe("GroundX document UUID"),
    }),
    handler: (input) => {
      const parsed = input as { documentId: string };
      return { kind: "openDocument", documentId: parsed.documentId };
    },
    availableSteps: ["doc-viewer"],
  };
}

const openDoc = mkTool("open_document");
const jumpToPage = mkTool("jump_to_page");

const bucketScope: ContentScope = { type: "bucket", bucketId: 42 };
const docsScope: ContentScope = { type: "documents", documentIds: ["doc-1"] };

describe("defineScopedViewerWidget — the base descriptor", () => {
  it("produces a frozen descriptor carrying id + kind + the tools SET", () => {
    const d = defineScopedViewerWidget({
      id: "pdf-viewer",
      kind: "doc-viewer",
      slot: "viewer-widgets",
      tools: [openDoc, jumpToPage],
    });
    expect(d.id).toBe("pdf-viewer");
    expect(d.kind).toBe("doc-viewer");
    expect(d.slot).toBe("viewer-widgets");
    expect(d.tools).toEqual([openDoc, jumpToPage]);
    expect(Object.isFrozen(d)).toBe(true);
    // The tools array is frozen too so callers can't mutate the descriptor's set.
    expect(Object.isFrozen(d.tools)).toBe(true);
  });

  it("accepts non-`show_` canvas-dispatch verbs (PdfViewer's open_/jump_)", () => {
    // The `show_`-verb-only throw was removed: verb prefixes are policed by
    // `check-tool-quality`, and the descriptor must accept the PdfViewer
    // open_/jump_ tools (which are NOT `show_`).
    expect(() =>
      defineScopedViewerWidget({
        id: "pdf-viewer",
        kind: "doc-viewer",
        slot: "viewer-widgets",
        tools: [openDoc, jumpToPage],
      }),
    ).not.toThrow();
  });

  it("rejects an empty id", () => {
    expect(() =>
      defineScopedViewerWidget({
        id: "",
        kind: "doc-viewer",
        slot: "viewer-widgets",
        tools: [openDoc],
      }),
    ).toThrow(/id/i);
  });

  it("rejects an empty tools set (a viewer widget must declare ≥1 canvas-dispatch tool)", () => {
    expect(() =>
      defineScopedViewerWidget({
        id: "no-tools",
        kind: "doc-viewer",
        slot: "viewer-widgets",
        tools: [],
      }),
    ).toThrow(/tool/i);
  });

  it("a descriptor satisfies the exported ScopedViewerWidgetDescriptor type", () => {
    const d: ScopedViewerWidgetDescriptor = defineScopedViewerWidget({
      id: "smart-report-render",
      kind: "report",
      slot: "viewer-widgets",
      tools: [mkTool("show_smart_report_render")],
    });
    expect(d.tools[0].name).toBe("show_smart_report_render");
  });
});

describe("scopeKey — stable scope identity", () => {
  it("is stable for the same logical scope", () => {
    expect(scopeKey(bucketScope)).toBe(scopeKey({ type: "bucket", bucketId: 42 }));
  });

  it("differs when the scope changes", () => {
    expect(scopeKey(bucketScope)).not.toBe(scopeKey(docsScope));
    expect(scopeKey(docsScope)).not.toBe(
      scopeKey({ type: "documents", documentIds: ["doc-1", "doc-2"] }),
    );
  });

  it("folds the composable filter into the key", () => {
    const a = scopeKey({ type: "bucket", bucketId: 42 });
    const b = scopeKey({ type: "bucket", bucketId: 42, filter: { projectId: "p1" } });
    expect(a).not.toBe(b);
  });

  it("is filter-key-order-insensitive (same identity regardless of key order)", () => {
    const a = scopeKey({ type: "bucket", bucketId: 42, filter: { fund: "f1", projectId: "p1" } });
    const b = scopeKey({ type: "bucket", bucketId: 42, filter: { projectId: "p1", fund: "f1" } });
    expect(a).toBe(b);
  });

  it("is value-array- and documentId-order-insensitive", () => {
    expect(scopeKey({ type: "bucket", bucketId: 42, filter: { projectId: ["p2", "p1"] } })).toBe(
      scopeKey({ type: "bucket", bucketId: 42, filter: { projectId: ["p1", "p2"] } }),
    );
    expect(scopeKey({ type: "documents", documentIds: ["d2", "d1"] })).toBe(
      scopeKey({ type: "documents", documentIds: ["d1", "d2"] }),
    );
  });
});

describe("useScopeAdapter — re-runs adaptation on scope change", () => {
  it("invokes the adapter once on mount", () => {
    const adapt = vi.fn();
    renderHook(({ scope }) => useScopeAdapter(scope, adapt), {
      initialProps: { scope: bucketScope },
    });
    expect(adapt).toHaveBeenCalledTimes(1);
    expect(adapt).toHaveBeenCalledWith(bucketScope);
  });

  it("re-invokes the adapter when the scope identity changes", () => {
    const adapt = vi.fn();
    const { rerender } = renderHook(({ scope }) => useScopeAdapter(scope, adapt), {
      initialProps: { scope: bucketScope as ContentScope },
    });
    expect(adapt).toHaveBeenCalledTimes(1);
    rerender({ scope: docsScope });
    expect(adapt).toHaveBeenCalledTimes(2);
    expect(adapt).toHaveBeenLastCalledWith(docsScope);
  });

  it("does NOT re-invoke when a structurally-equal scope is passed", () => {
    const adapt = vi.fn();
    const { rerender } = renderHook(({ scope }) => useScopeAdapter(scope, adapt), {
      initialProps: { scope: bucketScope as ContentScope },
    });
    rerender({ scope: { type: "bucket", bucketId: 42 } });
    expect(adapt).toHaveBeenCalledTimes(1);
  });
});
