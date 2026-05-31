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

const showDoc: WidgetTool = {
  name: "show_document",
  description:
    "Show a document in the viewer pane. Use when the user references a document by name.",
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

const bucketScope: ContentScope = { type: "bucket", bucketId: 42 };
const docsScope: ContentScope = { type: "documents", documentIds: ["doc-1"] };

describe("defineScopedViewerWidget — the base descriptor", () => {
  it("produces a frozen descriptor carrying id + show tool", () => {
    const d = defineScopedViewerWidget({
      id: "pdf-viewer",
      slot: "viewer-widgets",
      showTool: showDoc,
    });
    expect(d.id).toBe("pdf-viewer");
    expect(d.slot).toBe("viewer-widgets");
    expect(d.showTool).toBe(showDoc);
    expect(Object.isFrozen(d)).toBe(true);
  });

  it("requires the show tool name to start with the `show_` verb", () => {
    expect(() =>
      defineScopedViewerWidget({
        id: "bad",
        slot: "viewer-widgets",
        showTool: { ...showDoc, name: "open_document" },
      }),
    ).toThrow(/show_/);
  });

  it("rejects an empty id", () => {
    expect(() =>
      defineScopedViewerWidget({ id: "", slot: "viewer-widgets", showTool: showDoc }),
    ).toThrow(/id/i);
  });

  it("a descriptor satisfies the exported ScopedViewerWidgetDescriptor type", () => {
    const d: ScopedViewerWidgetDescriptor = defineScopedViewerWidget({
      id: "extract",
      slot: "viewer-widgets",
      showTool: { ...showDoc, name: "show_extract" },
    });
    expect(d.showTool.name).toBe("show_extract");
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
