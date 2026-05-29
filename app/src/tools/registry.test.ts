/**
 * widget-llm-integration Phase 3 — tool registry contract.
 *
 * The registry is the single point where every widget's
 * `<Name>.tools.ts` is composed into the LLM-facing tool catalog.
 * These tests pin the discovery + filtering shape; the runtime
 * surface lives at `app/src/tools/registry.ts`.
 *
 * Per design.md §I — co-located declarations, central registry. The
 * production registry singleton wraps `import.meta.glob(...)` over
 * the two widget slots; these tests use `createRegistry(modules)`
 * with synthetic modules so we don't have to materialize real tool
 * files just to exercise the merge logic.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { WidgetTool, WidgetToolModule } from "./types";
import { createRegistry } from "./registry";

const openDocument: WidgetTool = {
  name: "open_document",
  description: "Open a document in the viewer. Use when the user references a document by name.",
  category: "read",
  input: z.object({
    documentId: z.string().describe("GroundX document UUID"),
    page: z.number().int().positive().optional().describe("1-indexed page; defaults to 1"),
  }),
  handler: (input) => {
    const parsed = input as { documentId: string; page?: number };
    return { kind: "highlightCitation", documentId: parsed.documentId, page: parsed.page ?? 1 };
  },
  availableSteps: ["doc-viewer", "interact-chat"],
};

const proposeField: WidgetTool = {
  name: "propose_field",
  description:
    "Propose a new extraction-schema field. Triggers when the user asks for an additional column.",
  category: "mutate",
  input: z.object({
    name: z.string().min(1).describe("New field display name"),
    type: z.enum(["STRING", "NUMBER", "DATE", "BOOLEAN"]).describe("Field primitive type"),
  }),
  handler: () => null,
  availableSteps: ["extract-workbench"],
  availableIn: ["onboarding"],
};

function mkModule(tools: WidgetTool[]): WidgetToolModule {
  return { tools };
}

describe("toolRegistry — createRegistry", () => {
  it("an empty module map yields an empty catalog", () => {
    const reg = createRegistry({});
    expect(reg.all()).toEqual([]);
    expect(reg.byName("anything")).toBeUndefined();
    expect(reg.forStep("doc-viewer")).toEqual([]);
  });

  it("composes tools from multiple modules into one catalog", () => {
    const reg = createRegistry({
      "./PdfViewer/PdfViewerWidget.tools.ts": mkModule([openDocument]),
      "./ExtractWorkbench/ExtractWorkbench.tools.ts": mkModule([proposeField]),
    });
    expect(reg.all().map((t) => t.name).sort()).toEqual(["open_document", "propose_field"]);
    expect(reg.byName("open_document")).toBe(openDocument);
  });

  it("throws on duplicate tool names across modules", () => {
    const dup = { ...openDocument };
    expect(() =>
      createRegistry({
        "./A.tools.ts": mkModule([openDocument]),
        "./B.tools.ts": mkModule([dup]),
      }),
    ).toThrow(/duplicate tool name.*open_document/i);
  });

  it("accepts modules that export the canonical `tools` array name", () => {
    const reg = createRegistry({
      "./A.tools.ts": { tools: [openDocument] },
    });
    expect(reg.all()).toHaveLength(1);
  });

  it("skips modules with no `tools` export (resilient to placeholder files)", () => {
    const reg = createRegistry({
      "./Empty.tools.ts": {} as unknown as WidgetToolModule,
      "./A.tools.ts": mkModule([openDocument]),
    });
    expect(reg.all().map((t) => t.name)).toEqual(["open_document"]);
  });

  it("forStep filters by availableSteps", () => {
    const reg = createRegistry({
      "./A.tools.ts": mkModule([openDocument, proposeField]),
    });
    expect(reg.forStep("doc-viewer").map((t) => t.name)).toEqual(["open_document"]);
    expect(reg.forStep("extract-workbench").map((t) => t.name)).toEqual(["propose_field"]);
    expect(reg.forStep("report")).toEqual([]);
  });

  it("forStep with no availableSteps on the tool exposes it to every step", () => {
    const universal: WidgetTool = {
      name: "open_settings",
      description: "Open the app settings drawer. Use when the user asks to change configuration.",
      category: "read",
      input: z.object({}),
      handler: () => null,
    };
    const reg = createRegistry({ "./S.tools.ts": mkModule([universal]) });
    expect(reg.forStep("doc-viewer")).toContain(universal);
    expect(reg.forStep("report")).toContain(universal);
  });

  it("forStep applies the optional mode filter against availableIn", () => {
    const reg = createRegistry({
      "./A.tools.ts": mkModule([openDocument, proposeField]),
    });
    // propose_field is availableIn=["onboarding"]; not exposed in steady mode.
    expect(reg.forStep("extract-workbench", "steady")).toEqual([]);
    expect(reg.forStep("extract-workbench", "onboarding").map((t) => t.name)).toEqual([
      "propose_field",
    ]);
    // open_document declares no availableIn → exposed in both modes.
    expect(reg.forStep("doc-viewer", "steady").map((t) => t.name)).toEqual(["open_document"]);
    expect(reg.forStep("doc-viewer", "onboarding").map((t) => t.name)).toEqual(["open_document"]);
  });

  it("schema parses valid input through the registered tool", () => {
    const reg = createRegistry({ "./A.tools.ts": mkModule([openDocument]) });
    const tool = reg.byName("open_document")!;
    const ok = tool.input.safeParse({ documentId: "doc-1", page: 5 });
    expect(ok.success).toBe(true);
    const bad = tool.input.safeParse({ documentId: 42 });
    expect(bad.success).toBe(false);
  });
});
