/**
 * widget-llm-integration Phase 4 — PdfViewer reference tools.
 *
 * Pins the LLM tool surface for the PDF viewer:
 *
 *   • `open_document` (read) — opens/highlights a cited document
 *   • `jump_to_page` (read) — jumps the active viewer to a page
 *
 * The tests exercise the app-side metadata and Zod schemas. Executable
 * CanvasIntent construction lives in the middleware `SERVER_TOOL_CATALOG`.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./PdfViewerWidget.tools";

const byName = (name: string) => tools.find((t) => t.name === name)!;

describe("PdfViewer tools", () => {
  it("declares the two expected tools", () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["jump_to_page", "open_document"]);
  });

  describe("open_document", () => {
    const tool = byName("open_document");

    it("is a read-category tool available in both modes", () => {
      expect(tool.category).toBe("read");
      // Defaults to both modes by omission.
      expect(tool.availableIn).toBeUndefined();
    });

    it("Zod schema accepts a documentId-only payload", () => {
      const ok = tool.input.safeParse({ documentId: "doc-1" });
      expect(ok.success).toBe(true);
    });

    it("Zod schema accepts a documentId + page payload", () => {
      const ok = tool.input.safeParse({ documentId: "doc-1", page: 5 });
      expect(ok.success).toBe(true);
    });

    it("Zod schema rejects non-string documentId", () => {
      const bad = tool.input.safeParse({ documentId: 42 });
      expect(bad.success).toBe(false);
    });

    it("Zod schema rejects non-positive page numbers", () => {
      const bad = tool.input.safeParse({ documentId: "doc-1", page: 0 });
      expect(bad.success).toBe(false);
    });

    it("is exposed where a doc-viewer surface is mountable", () => {
      expect(tool.availableSteps).toEqual(
        expect.arrayContaining(["doc-viewer", "interact-chat", "extract-workbench"]),
      );
    });
  });

  describe("jump_to_page", () => {
    const tool = byName("jump_to_page");

    it("is a read-category tool available in both modes + every step where a doc-viewer is mountable", () => {
      expect(tool.category).toBe("read");
      expect(tool.availableSteps).toContain("doc-viewer");
    });

    it("Zod schema accepts a documentId + page payload", () => {
      const ok = tool.input.safeParse({ documentId: "doc-1", page: 3 });
      expect(ok.success).toBe(true);
    });

    it("Zod schema requires a positive integer page", () => {
      expect(tool.input.safeParse({ documentId: "doc-1" }).success).toBe(false);
      expect(tool.input.safeParse({ documentId: "doc-1", page: -2 }).success).toBe(false);
      expect(tool.input.safeParse({ documentId: "doc-1", page: 1.5 }).success).toBe(false);
    });

  });

  it("every Zod field carries a .describe() (Phase 5b quality rule)", () => {
    for (const tool of tools) {
      // walk the top-level object shape
      const shape = (tool.input as { _def: { shape: () => Record<string, { _def: { description?: string } }> } })._def.shape();
      for (const [field, spec] of Object.entries(shape)) {
        expect(
          spec._def.description?.length ?? 0,
          `${tool.name}.${field} is missing .describe()`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("every tool description carries a 'Use when' or 'Triggers when' clause (Phase 5b quality rule)", () => {
    for (const tool of tools) {
      expect(
        /use when|triggers when/i.test(tool.description),
        `${tool.name} description missing "Use when" / "Triggers when" clause`,
      ).toBe(true);
      expect(tool.description.length).toBeGreaterThanOrEqual(40);
    }
  });
});
