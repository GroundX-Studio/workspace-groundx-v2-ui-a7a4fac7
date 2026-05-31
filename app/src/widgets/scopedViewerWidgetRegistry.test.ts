/**
 * ScopedViewerWidget registry — conforms to the shared `Catalog<T>`
 * read contract (`@groundx/shared`). The registry is the single place
 * the four viewer-widget descriptors are enumerated/looked-up; its
 * unique-id invariant routes through the shared `assertUniqueIds`.
 *
 * The factory is generic over the catalog item with an explicit `idOf`
 * accessor (the production singleton keys mounts by `m.descriptor.id`;
 * here we key descriptors by `d.id`). Same one mechanism, one axis.
 *
 * TDD: failing-first. The module under test does not exist yet.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Catalog } from "@groundx/shared";

import type { WidgetTool } from "@/tools/types";
import { defineScopedViewerWidget } from "./scopedViewerWidget";
import { createScopedViewerWidgetRegistry } from "./scopedViewerWidgetRegistry";

function mkTool(name: string): WidgetTool {
  return {
    name,
    description: `${name} — show a scoped viewer surface. Use when the user asks to view it.`,
    category: "read",
    input: z.object({}),
    handler: () => null,
  };
}

const pdf = defineScopedViewerWidget({
  id: "pdf-viewer",
  kind: "doc-viewer",
  slot: "viewer-widgets",
  tools: [mkTool("open_document")],
});
const extract = defineScopedViewerWidget({
  id: "extract",
  kind: "report",
  slot: "viewer-widgets",
  tools: [mkTool("show_smart_report_render")],
});

describe("createScopedViewerWidgetRegistry — Catalog<ScopedViewerWidgetDescriptor>", () => {
  it("satisfies the shared Catalog<T> read contract", () => {
    const reg: Catalog<ReturnType<typeof defineScopedViewerWidget>> =
      createScopedViewerWidgetRegistry([pdf, extract], (d) => d.id);
    expect(typeof reg.all).toBe("function");
    expect(typeof reg.byId).toBe("function");
  });

  it("all() enumerates descriptors in stable insertion order", () => {
    const reg = createScopedViewerWidgetRegistry([pdf, extract], (d) => d.id);
    expect(reg.all().map((d) => d.id)).toEqual(["pdf-viewer", "extract"]);
  });

  it("byId() looks up a descriptor", () => {
    const reg = createScopedViewerWidgetRegistry([pdf, extract], (d) => d.id);
    expect(reg.byId("extract")).toBe(extract);
    expect(reg.byId("nope")).toBeUndefined();
  });

  it("throws on a duplicate id, naming the id", () => {
    const dup = defineScopedViewerWidget({
      id: "pdf-viewer",
      kind: "report",
      slot: "viewer-widgets",
      tools: [mkTool("open_document_again")],
    });
    expect(() => createScopedViewerWidgetRegistry([pdf, dup], (d) => d.id)).toThrow(
      /pdf-viewer/,
    );
  });

  it("an empty registry is valid", () => {
    const reg = createScopedViewerWidgetRegistry(
      [] as ReturnType<typeof defineScopedViewerWidget>[],
      (d) => d.id,
    );
    expect(reg.all()).toEqual([]);
    expect(reg.byId("x")).toBeUndefined();
  });
});
