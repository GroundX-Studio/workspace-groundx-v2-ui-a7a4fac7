/**
 * widget-llm-integration Phase 4 — PdfViewer reference tools.
 *
 * Pins the LLM tool surface for the PDF viewer:
 *
 *   • `open_document` (read) — produces a `highlightCitation` intent
 *     pointing at page 1 (or the explicit page, when supplied)
 *   • `jump_to_page` (read) — produces a `jumpToPage` intent (the
 *     lighter-weight cousin of `highlightCitation`, no bbox)
 *
 * The tests exercise both the Zod schemas (valid + invalid input) and
 * the handlers' produced `CanvasIntent` shape. Round-trip dispatch
 * through the orchestrator is exercised in the Phase 5 middleware
 * suite; this file is the unit-level contract.
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

    it("Zod schema accepts a documentId-only payload (page defaults inside handler)", () => {
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

    it("handler produces a highlightCitation intent with the requested page", () => {
      const intent = tool.handler({ documentId: "doc-abc", page: 7 });
      expect(intent).toEqual({ kind: "highlightCitation", documentId: "doc-abc", page: 7 });
    });

    it("handler defaults page to 1 when omitted", () => {
      const intent = tool.handler({ documentId: "doc-abc" });
      expect(intent).toEqual({ kind: "highlightCitation", documentId: "doc-abc", page: 1 });
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

    it("handler produces a jumpToPage intent (no bbox)", () => {
      const intent = tool.handler({ documentId: "doc-xyz", page: 12 });
      expect(intent).toEqual({ kind: "jumpToPage", documentId: "doc-xyz", page: 12 });
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
