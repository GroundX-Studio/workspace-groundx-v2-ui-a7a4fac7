/**
 * Phase 5 — server-side tool catalog drift guard.
 *
 * The catalog is hand-mirrored from the app side. This test pins the
 * authoritative name set so adding a tool on the app side without
 * mirroring it here turns the suite red (and vice versa).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { viewerStepKindSchema } from "@groundx/shared";

import {
  getServerTool,
  roleExposes,
  SERVER_TOOL_CATALOG,
  toolsForStep,
  UNKNOWN_VIEWER_STEP,
  type ServerTool,
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
  // 2026-05-31-shared-canvas-affordance-restoration — gate-open tool (the chat
  // successor to the retired F5 Interact Save button).
  "save_to_account",
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
  // 2026-05-31-tool-system-completion — wf04 §1/§2/§4 deferred tools.
  "submit_signup",
  "wizard_next",
  "wizard_back",
  "wizard_finish",
  "dismiss_wizard",
  "close_dialog",
  // agentic-tool-loop — server-executed read tool (no app mirror; server-only).
  "lookup_groundx_docs",
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

  // agentic-tool-loop — a tool is EITHER intent-routed or server-executed, never
  // both and never neither; a server-executed tool is read-only and carries the
  // user-facing activity label surfaced on reply.toolActivity[].
  it("every tool declares exactly one of intentBuilder / serverExecute", () => {
    for (const tool of SERVER_TOOL_CATALOG) {
      const hasIntent = typeof tool.intentBuilder === "function";
      const hasServerExec = typeof tool.serverExecute === "function";
      expect(
        hasIntent !== hasServerExec,
        `${tool.name} must declare exactly one of intentBuilder / serverExecute`,
      ).toBe(true);
    }
  });

  it("every serverExecute tool is read-category and declares an activityLabel", () => {
    for (const tool of SERVER_TOOL_CATALOG) {
      if (typeof tool.serverExecute !== "function") continue;
      expect(tool.category, `${tool.name} serverExecute must be category:read`).toBe("read");
      expect(
        (tool.activityLabel?.length ?? 0) > 0,
        `${tool.name} serverExecute must declare a non-empty activityLabel`,
      ).toBe(true);
    }
  });

  it("toolsForStep filters by availableSteps", () => {
    // doc-viewer step exposes: PdfViewer's 2 tools + ProposeSchemaFieldCard's
    // 3 + the unscoped (universal) tools suggest_intent + commit_gate /
    // dismiss_gate / book_call. Names are returned sorted.
    expect(toolsForStep("doc-viewer").map((t) => t.name).sort()).toEqual(
      [
        "accept_proposal",
        "book_call",
        // tool-system-completion — DialogTitle close is universal (no step filter).
        "close_dialog",
        "commit_gate",
        // tool-system-completion — wizard nav is universal (no step filter).
        "dismiss_gate",
        "dismiss_wizard",
        "jump_to_page",
        // agentic-tool-loop — server-executed product-docs lookup is universal.
        "lookup_groundx_docs",
        "open_document",
        // smart-report Phase 5 — pin + render are reachable from the doc-viewer.
        "pin_to_report",
        "propose_schema_field",
        "reject_proposal",
        // shared-canvas-affordance-restoration — save_to_account opens the gate
        // from the doc-viewer / interact canvas (the chat Save successor).
        "save_to_account",
        // onboarding-shell-shared-view Phase 3a — show_extraction is reachable
        // from the doc-viewer (the user can ask to see the extraction).
        "show_extraction",
        // onboarding-shell-shared-view Phase 3b — show_integrate is reachable
        // from the doc-viewer (the user can ask to ship/integrate).
        "show_integrate",
        // 2026-06-11 — canvas-navigation tools are universal; the builder is
        // now reachable from anywhere ("edit the report" from the doc-viewer).
        "show_smart_report_edit",
        "show_smart_report_render",
        // tool-system-completion — sign-up submit is universal (no step filter).
        "submit_signup",
        "suggest_intent",
        "wizard_back",
        "wizard_finish",
        "wizard_next",
      ],
    );
    // `report` step now exposes the smart-report tool surface (Phase 5) +
    // the universal tools. `pin_to_report` also lists `report` among its steps.
    expect(toolsForStep("report").map((t) => t.name).sort()).toEqual([
      "accept_report_section",
      "book_call",
      // tool-system-completion — universal tools (no availableSteps).
      "close_dialog",
      "commit_gate",
      "delete_report_section",
      "dismiss_gate",
      "dismiss_wizard",
      "edit_report_section",
      // agentic-tool-loop — server-executed product-docs lookup is universal.
      "lookup_groundx_docs",
      "pin_to_report",
      "propose_report_section",
      "reject_report_section",
      // onboarding-shell-shared-view Phase 3a — show_extraction lists `report`.
      "show_extraction",
      // onboarding-shell-shared-view Phase 3b — show_integrate lists `report`.
      "show_integrate",
      "show_smart_report_edit",
      "show_smart_report_render",
      "submit_signup",
      "suggest_intent",
      "wizard_back",
      "wizard_finish",
      "wizard_next",
    ]);
  });

  // Canvas-NAVIGATION tools are universal (2026-06-11). Step-gating makes
  // sense for step-LOCAL tools (proposals need their workbench context), but
  // navigation tools exist to move BETWEEN steps — gating them by where the
  // user already is defeats their purpose. Live failure that exposed this:
  // "go back to extractions" typed on the Integrate step got a RAG search
  // because `show_extraction` wasn't offered there.
  it("every canvas-navigation show_* tool is available from EVERY step", () => {
    const NAV_TOOLS = [
      "show_extraction",
      "show_integrate",
      "show_smart_report_render",
      "show_smart_report_edit",
    ];
    const ALL_STEPS = [
      "ingest-picker",
      "doc-viewer",
      "extract-workbench",
      "interact-chat",
      "report",
      "integrate",
    ] as const;
    for (const step of ALL_STEPS) {
      const offered = toolsForStep(step).map((t) => t.name);
      for (const nav of NAV_TOOLS) {
        expect(offered, `${nav} must be offered on step "${step}"`).toContain(nav);
      }
    }
  });

  it("toolsForStep with undefined returns the full catalog", () => {
    expect(toolsForStep(undefined).length).toBe(SERVER_TOOL_CATALOG.length);
  });

  // ── 2026-06-01-data-model-tail item 2a: "unknown step → safe minimum" ──
  //
  // SECURITY: the middleware faces the wire. `request.activeStepKind` is an
  // untrusted string. A naive `safeParse → undefined` fallback would map an
  // invalid kind to `undefined`, which `toolsForStep` treats as the LEGACY
  // (full-catalog) caller — WIDENING the tool surface exposed to the LLM. The
  // fix is an explicit "unknown" signal that resolves to the SAFE MINIMUM
  // (universal/unrestricted tools only — strictly a subset of every valid
  // step's set), never the full catalog and never wider than a valid step.
  it("toolsForStep(UNKNOWN_VIEWER_STEP) returns ONLY the safe-minimum (universal) set", () => {
    const safe = toolsForStep(UNKNOWN_VIEWER_STEP).map((t) => t.name).sort();
    // safe minimum == tools with no `availableSteps` restriction (universal).
    const universal = SERVER_TOOL_CATALOG.filter(
      (t) => !t.availableSteps || t.availableSteps.length === 0,
    )
      .map((t) => t.name)
      .sort();
    expect(safe).toEqual(universal);
    // Must NOT be the full catalog (the widening this guard exists to stop).
    expect(safe.length).toBeLessThan(SERVER_TOOL_CATALOG.length);
    // Must NOT be wider than ANY valid step's filtered set: safe ⊆ each valid set.
    for (const kind of viewerStepKindSchema.options) {
      const validSet = new Set(toolsForStep(kind).map((t) => t.name));
      for (const name of safe) {
        expect(validSet.has(name)).toBe(true);
      }
      // and the safe minimum is never larger than a valid step's set.
      expect(safe.length).toBeLessThanOrEqual(validSet.size);
    }
  });

  it("toolsForStep(UNKNOWN_VIEWER_STEP) composes with the role filter", () => {
    // The unknown→safe-minimum path still honors the SERVER-derived role axis.
    const anonSafe = new Set(
      toolsForStep(UNKNOWN_VIEWER_STEP, "anonymous").map((t) => t.name),
    );
    const memberSafe = toolsForStep(UNKNOWN_VIEWER_STEP, "member").map((t) => t.name);
    // anonymous safe-minimum is a subset of member safe-minimum.
    for (const name of anonSafe) {
      expect(memberSafe).toContain(name);
    }
  });

  // ── 2026-05-31-tool-system-completion: server role axis + filter ──
  //
  // The behavioral gate: `toolsForStep(step, role)` exposes a tool to the LLM
  // IFF (`availableIn` undefined/empty → all roles) OR role ∈ `availableIn`.
  // `category` (read/mutate) does NOT gate visibility. Role is derived
  // SERVER-side (chatHandler) from the session, never trusted from the client.
  describe("role-scoped catalog (availableIn: WidgetRole[])", () => {
    it("every shipped tool with no availableIn is exposed to BOTH roles", () => {
      // No shipped tool is role-restricted today (edit_template is the
      // _template stub, not shipped). So the anonymous + member catalogs are
      // identical and equal to the full per-step catalog.
      const stepAnon = toolsForStep(undefined, "anonymous").map((t) => t.name).sort();
      const stepMember = toolsForStep(undefined, "member").map((t) => t.name).sort();
      const stepAll = SERVER_TOOL_CATALOG.map((t) => t.name).sort();
      expect(stepAnon).toEqual(stepAll);
      expect(stepMember).toEqual(stepAll);
    });

    it("category (mutate) does NOT gate visibility — a mutate tool is exposed to anonymous", () => {
      // propose_schema_field is mutate + all-roles → anonymous still sees it.
      const anon = toolsForStep("extract-workbench", "anonymous").map((t) => t.name);
      expect(anon).toContain("propose_schema_field");
      expect(getServerTool("propose_schema_field")!.category).toBe("mutate");
    });

    it("a role NOT in a tool's availableIn hides the tool; a role IN it exposes it", () => {
      // Exercise the filter directly against a constructed member-only tool so
      // the rule is pinned even though no shipped tool is member-only today.
      const memberOnly: ServerTool = {
        name: "edit_fixture_template",
        description:
          "Fixture member-only tool. Use when the role-filter rule is under test (not shipped).",
        category: "mutate",
        inputSchema: z.object({ id: z.string().describe("id") }),
        availableIn: ["member"],
        intentBuilder: () => ({ kind: "noop" }),
      };
      expect(roleExposes(memberOnly, "member")).toBe(true);
      expect(roleExposes(memberOnly, "anonymous")).toBe(false);
      // Absent availableIn → all roles.
      const allRoles: ServerTool = { ...memberOnly, availableIn: undefined };
      expect(roleExposes(allRoles, "anonymous")).toBe(true);
      expect(roleExposes(allRoles, "member")).toBe(true);
      // Empty availableIn → all roles.
      const emptyRoles: ServerTool = { ...memberOnly, availableIn: [] };
      expect(roleExposes(emptyRoles, "anonymous")).toBe(true);
    });

    it("toolsForStep with no role argument is unchanged (back-compat — full per-step catalog)", () => {
      expect(toolsForStep("report").map((t) => t.name).sort()).toEqual(
        toolsForStep("report", undefined).map((t) => t.name).sort(),
      );
    });
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
