/**
 * Phase 5 — server-side tool catalog drift guard.
 *
 * The catalog is hand-mirrored from the app side. This test pins the
 * authoritative name set so adding a tool on the app side without
 * mirroring it here turns the suite red (and vice versa).
 */
import { describe, expect, it } from "vitest";

import {
  getServerTool,
  SERVER_TOOL_CATALOG,
  toolsForStep,
} from "./toolCatalog.js";

const EXPECTED_NAMES = [
  "open_document",
  "jump_to_page",
  "propose_schema_field",
  "accept_proposal",
  "reject_proposal",
  "suggest_intent",
  "commit_gate",
  "dismiss_gate",
  "book_call",
  // 2026-05-30-onboarding-shell-shared-view Phase 3a — extract canvas-dispatch.
  "show_extraction",
  // 2026-05-30-onboarding-shell-shared-view Phase 3b — integrate canvas-dispatch.
  "show_integrate",
  // 2026-05-29-smart-report-screen Phase 5 — report tool surface.
  "show_smart_report_render",
  "show_smart_report_edit",
  "pin_to_report",
  "propose_report_section",
  "accept_report_section",
  "reject_report_section",
  "edit_report_section",
  "delete_report_section",
].sort();

describe("server tool catalog", () => {
  it("declares the expected authoritative tool name set (mirror of app side)", () => {
    expect(SERVER_TOOL_CATALOG.map((t) => t.name).sort()).toEqual(EXPECTED_NAMES);
  });

  it("rejects duplicate tool names", () => {
    const names = SERVER_TOOL_CATALOG.map((t) => t.name);
    const set = new Set(names);
    expect(set.size).toBe(names.length);
  });

  it("every description carries a Use when / Triggers when clause AND meets the 40-char floor", () => {
    for (const tool of SERVER_TOOL_CATALOG) {
      expect(
        /use when|triggers when/i.test(tool.description),
        `${tool.name} missing "Use when" / "Triggers when"`,
      ).toBe(true);
      expect(tool.description.length).toBeGreaterThanOrEqual(40);
    }
  });

  it("every Zod field on every tool input carries .describe()", () => {
    for (const tool of SERVER_TOOL_CATALOG) {
      const shape = (tool.inputSchema as unknown as {
        _def: { shape: () => Record<string, { _def: { description?: string } }> };
      })._def.shape();
      for (const [field, spec] of Object.entries(shape)) {
        expect(
          spec._def.description?.length ?? 0,
          `${tool.name}.${field} is missing .describe()`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("getServerTool resolves known names + returns undefined for unknown", () => {
    expect(getServerTool("open_document")?.name).toBe("open_document");
    expect(getServerTool("nonexistent_tool")).toBeUndefined();
  });

  it("toolsForStep filters by availableSteps", () => {
    // doc-viewer step exposes: PdfViewer's 2 tools + ProposeSchemaFieldCard's
    // 3 + the unscoped (universal) tools suggest_intent + commit_gate /
    // dismiss_gate / book_call. Names are returned sorted.
    expect(toolsForStep("doc-viewer").map((t) => t.name).sort()).toEqual(
      [
        "accept_proposal",
        "book_call",
        "commit_gate",
        "dismiss_gate",
        "jump_to_page",
        "open_document",
        // smart-report Phase 5 — pin + render are reachable from the doc-viewer.
        "pin_to_report",
        "propose_schema_field",
        "reject_proposal",
        // onboarding-shell-shared-view Phase 3a — show_extraction is reachable
        // from the doc-viewer (the user can ask to see the extraction).
        "show_extraction",
        // onboarding-shell-shared-view Phase 3b — show_integrate is reachable
        // from the doc-viewer (the user can ask to ship/integrate).
        "show_integrate",
        "show_smart_report_render",
        "suggest_intent",
      ],
    );
    // `report` step now exposes the smart-report tool surface (Phase 5) +
    // the universal tools. `pin_to_report` also lists `report` among its steps.
    expect(toolsForStep("report").map((t) => t.name).sort()).toEqual([
      "accept_report_section",
      "book_call",
      "commit_gate",
      "delete_report_section",
      "dismiss_gate",
      "edit_report_section",
      "pin_to_report",
      "propose_report_section",
      "reject_report_section",
      // onboarding-shell-shared-view Phase 3a — show_extraction lists `report`.
      "show_extraction",
      // onboarding-shell-shared-view Phase 3b — show_integrate lists `report`.
      "show_integrate",
      "show_smart_report_edit",
      "show_smart_report_render",
      "suggest_intent",
    ]);
  });

  it("toolsForStep with undefined returns the full catalog", () => {
    expect(toolsForStep(undefined).length).toBe(SERVER_TOOL_CATALOG.length);
  });

  describe("open_document intentBuilder", () => {
    const tool = getServerTool("open_document")!;

    it("validates input + produces a highlightCitation intent", () => {
      const parsed = tool.inputSchema.parse({ documentId: "doc-1", page: 7 });
      expect(tool.intentBuilder(parsed)).toEqual({
        kind: "highlightCitation",
        documentId: "doc-1",
        page: 7,
      });
    });

    it("defaults page to 1 when omitted", () => {
      const parsed = tool.inputSchema.parse({ documentId: "doc-1" });
      expect(tool.intentBuilder(parsed)).toEqual({
        kind: "highlightCitation",
        documentId: "doc-1",
        page: 1,
      });
    });

    it("rejects bad input (non-string documentId)", () => {
      expect(tool.inputSchema.safeParse({ documentId: 42 }).success).toBe(false);
    });
  });

  describe("show_smart_report_edit intentBuilder", () => {
    const tool = getServerTool("show_smart_report_edit")!;

    it("threads selected_section_id into the editTemplate intent", () => {
      const parsed = tool.inputSchema.parse({
        template_id: "tpl-1",
        selected_section_id: "charge_breakdown",
      });
      expect(tool.intentBuilder(parsed)).toEqual({
        kind: "editTemplate",
        templateId: "tpl-1",
        selectedSectionId: "charge_breakdown",
      });
    });

    it("omits selectedSectionId when not supplied", () => {
      const parsed = tool.inputSchema.parse({ template_id: "tpl-1" });
      expect(tool.intentBuilder(parsed)).toEqual({
        kind: "editTemplate",
        templateId: "tpl-1",
      });
    });
  });

  describe("jump_to_page intentBuilder", () => {
    const tool = getServerTool("jump_to_page")!;

    it("validates input + produces a jumpToPage intent", () => {
      const parsed = tool.inputSchema.parse({ documentId: "doc-2", page: 12 });
      expect(tool.intentBuilder(parsed)).toEqual({
        kind: "jumpToPage",
        documentId: "doc-2",
        page: 12,
      });
    });

    it("requires page (no default)", () => {
      expect(tool.inputSchema.safeParse({ documentId: "doc-2" }).success).toBe(false);
    });
  });
});
