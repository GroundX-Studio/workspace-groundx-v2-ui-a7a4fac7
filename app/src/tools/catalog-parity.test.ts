/**
 * 2026-05-31-tool-system-completion (UNBLOCK 3) — app↔server tool-catalog
 * parity guard.
 *
 * SHAPE (gate-answered): a minimal CROSS-PACKAGE test — this app-side test
 * imports BOTH catalogs (the app declarative tool metadata and the middleware
 * `SERVER_TOOL_CATALOG`) and asserts they agree on tool NAME + ROLE. NOT a
 * committed manifest. It runs in the app vitest suite (the standard `npm test`
 * command), not a manual-only check.
 *
 * Why app-side: the app catalog is assembled via Vite's `import.meta.glob`,
 * which only resolves under the Vite-based runner — so the app must be the
 * importer. The middleware `toolCatalog.ts` imports only `zod` +
 * `@groundx/shared` (no node-only deps), so importing it here is safe.
 *
 * ROLE model (gate-answered decision (b)): the middleware `SERVER_TOOL_CATALOG`
 * is the SOLE role-bearing surface; the app-side `WidgetTool.availableIn`
 * orphan is NOT migrated. So "role agreement" is asserted against the single
 * source-of-truth role map below (derived from `docs/agents/widget-access-
 * matrix.md` §3) — every SHIPPED tool is all-roles today (the matrix's lone
 * `edit_template = ["member"]` is the unshipped `_template` stub). A divergent
 * `availableIn` on either side fails the guard.
 *
 * SERVER-ONLY tools (no widget owns them) are an explicit, documented
 * exception — they have no app mirror by design.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { collectAppToolSpecs } from "./appToolSpecs";
// Cross-package import — the middleware server catalog (the role-bearing side).
import { SERVER_TOOL_CATALOG } from "../../../middleware/src/services/toolCatalog";
import type { WidgetRole } from "@groundx/shared";

// Tools that live ONLY on the server (no widget owns them). They have no app
// mirror by design — `suggest_intent` is the server-side canvas-navigation
// suggestion (the app resolves the kebab label against scenario context);
// `lookup_groundx_docs` (agentic-tool-loop) is server-EXECUTED — the middleware
// runs it inside the grounded tool-result loop and it never reaches the app.
const SERVER_ONLY = new Set(["suggest_intent", "lookup_groundx_docs"]);

// The single source-of-truth role map (matrix §3). Any tool NOT listed here is
// all-roles (no `availableIn`). Adding a role-restricted tool means adding a
// row here AND a matrix row — the guard fails if either side diverges.
const ROLE_RESTRICTED: Record<string, WidgetRole[]> = {
  // (none shipped today — edit_template is the unshipped _template stub)
};

describe("app↔server tool-catalog parity (NAME + role)", () => {
  const appTools = collectAppToolSpecs(import.meta.glob(
    [
      "../components/chat-widgets/*/*.tools.ts",
      "../components/viewer-widgets/*/*.tools.ts",
      "../views/**/*.tools.ts",
      "../components/primitives/**/*.tools.ts",
    ],
    { eager: true },
  ));
  const appByName = new Map(appTools.map((t) => [t.name, t]));
  const appNames = appTools.map((t) => t.name).sort();
  const serverByName = new Map(SERVER_TOOL_CATALOG.map((t) => [t.name, t]));
  const serverNames = SERVER_TOOL_CATALOG.map((t) => t.name).sort();

  it("every app tool has a server mirror (same name)", () => {
    const missing = appNames.filter((n) => !serverByName.has(n));
    expect(missing, `app tools missing a server mirror: ${missing.join(", ")}`).toEqual([]);
  });

  it("every server tool maps to an app tool (or is an allowlisted server-only tool)", () => {
    const appSet = new Set(appNames);
    const orphanServer = serverNames.filter((n) => !appSet.has(n) && !SERVER_ONLY.has(n));
    expect(
      orphanServer,
      `server tools with no app mirror (and not server-only): ${orphanServer.join(", ")}`,
    ).toEqual([]);
  });

  it("the server catalog's roles match the single source-of-truth role map", () => {
    for (const tool of SERVER_TOOL_CATALOG) {
      const expected = ROLE_RESTRICTED[tool.name];
      if (expected === undefined) {
        // Not role-restricted → must be all-roles (absent/empty availableIn).
        expect(
          tool.availableIn === undefined || tool.availableIn.length === 0,
          `${tool.name} carries an unexpected availableIn=${JSON.stringify(tool.availableIn)} (not in the role map)`,
        ).toBe(true);
      } else {
        expect(
          [...(tool.availableIn ?? [])].sort(),
          `${tool.name} availableIn diverges from the matrix role map`,
        ).toEqual([...expected].sort());
      }
    }
  });

  // 2026-05-31-core-data-followups §4b — upgrade the drift guard from NAME-only
  // to NAME+DESCRIPTION parity. The description is the single most impactful
  // field for tool-selection accuracy (design.md §I) and is an app↔middleware
  // wire twin: the same tool's `description` was hand-mirrored on each side and
  // ~9 of them drifted (wording diverged silently). Asserting equality here
  // means a future edit to one side that isn't mirrored fails the suite.
  // SERVER-ONLY tools have no app mirror by design and are skipped.
  it("every app tool's description matches its server mirror's description verbatim", () => {
    const mismatches: string[] = [];
    for (const tool of appTools) {
      const server = serverByName.get(tool.name);
      if (server === undefined) continue; // missing-mirror covered by the name guard
      if (server.description !== tool.description) {
        mismatches.push(
          `${tool.name}\n  app:    ${JSON.stringify(tool.description)}\n  server: ${JSON.stringify(server.description)}`,
        );
      }
    }
    expect(mismatches, `tool descriptions drifted app↔server:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it("the new wf04 tools (submit_signup / wizard_* / close_dialog) are mirrored on both sides", () => {
    for (const name of [
      "submit_signup",
      "wizard_next",
      "wizard_back",
      "wizard_finish",
      "dismiss_wizard",
      "close_dialog",
    ]) {
      expect(appNames, `${name} missing on the app side`).toContain(name);
      expect(serverNames, `${name} missing on the server side`).toContain(name);
    }
  });

  // ── 2026-05-31-core-data-followups §5 — chat-widget reachability guard ─────
  //
  // The `ScopedViewerWidget` registry covers VIEWER widgets only — `<ScopedCanvas>`
  // resolves `step.kind → CanvasKind → mount → component`. CHAT widgets mount
  // IMPERATIVELY in the chat column when a tool fires, so they have no registry.
  // This guard closes that gap: a TOOL-triggered chat card declares a
  // `rendersWidget: "<slot>/<WidgetName>"` binding (on BOTH the app `*.tools.ts`
  // and the `SERVER_TOOL_CATALOG` mirror), and this coverage test asserts:
  //   1. each enumerated card tool DECLARES a binding on both sides;
  //   2. the app↔server bindings AGREE (riding the existing parity guard — NOT a
  //      second tool list);
  //   3. every binding resolves to a REAL mounted chat-widget directory.
  //
  // Always-on chat widgets (ThinkingStream, the input bar, GateChatRail-by-gate-
  // state) are a DELIBERATE exemption — they are not tool-triggered; ChatColumn's
  // render tests cover them. Phase-2 data-driven ChatColumn dispatch is deferred
  // (earn the axis — these three bindings are the only real consumers today).
  describe("chat-widget reachability (rendersWidget bindings)", () => {
    const HERE = dirname(fileURLToPath(import.meta.url));
    const CHAT_WIDGETS_DIR = resolve(HERE, "..", "components", "chat-widgets");

    // The TOOL-triggered chat cards (tasks.md §5 item 4). The binding string is
    // the ONLY hand-maintained datum; everything else is derived from the live
    // catalogs + the filesystem, so this is not a parallel catalog.
    const CARD_TOOL_BINDINGS: Record<string, string> = {
      propose_schema_field: "chat-widgets/ProposeSchemaFieldCard",
      book_call: "chat-widgets/BookingStatusCard",
      save_to_account: "chat-widgets/SuggestedActionChips",
    };

    /** Resolve a `"<slot>/<WidgetName>"` binding to a real mounted widget dir. */
    function bindingResolvesToMountedWidget(binding: string): boolean {
      const [slot, name] = binding.split("/");
      if (slot !== "chat-widgets" || !name) return false;
      const dir = join(CHAT_WIDGETS_DIR, name);
      return existsSync(dir) && statSync(dir).isDirectory();
    }

    it("every enumerated card tool declares a rendersWidget binding on the APP side", () => {
      for (const [toolName, expected] of Object.entries(CARD_TOOL_BINDINGS)) {
        const tool = appByName.get(toolName);
        expect(tool, `${toolName} not found in the app tool metadata`).toBeDefined();
        expect(
          tool!.rendersWidget,
          `${toolName} (app) must declare rendersWidget: "${expected}"`,
        ).toBe(expected);
      }
    });

    it("every enumerated card tool declares the SAME rendersWidget binding on the SERVER side", () => {
      for (const [toolName, expected] of Object.entries(CARD_TOOL_BINDINGS)) {
        const tool = serverByName.get(toolName);
        expect(tool, `${toolName} not found in SERVER_TOOL_CATALOG`).toBeDefined();
        expect(
          tool!.rendersWidget,
          `${toolName} (server) must declare rendersWidget: "${expected}" (app↔server parity)`,
        ).toBe(expected);
      }
    });

    it("every rendersWidget binding (either catalog) resolves to a REAL mounted chat widget", () => {
      const dangling: string[] = [];
      for (const tool of appTools) {
        if (tool.rendersWidget && !bindingResolvesToMountedWidget(tool.rendersWidget)) {
          dangling.push(`app ${tool.name} → "${tool.rendersWidget}"`);
        }
      }
      for (const tool of SERVER_TOOL_CATALOG) {
        if (tool.rendersWidget && !bindingResolvesToMountedWidget(tool.rendersWidget)) {
          dangling.push(`server ${tool.name} → "${tool.rendersWidget}"`);
        }
      }
      expect(
        dangling.length === 0,
        `rendersWidget binding(s) point at a NON-mounted chat widget (dangling):\n  ${dangling.join("\n  ")}`,
      ).toBe(true);
    });

    // Coverage direction-2: every tool that DECLARES a binding is one of the
    // enumerated cards (no untracked binding sneaks in unmirrored). New
    // card-triggering tools must extend CARD_TOOL_BINDINGS in the same change.
    it("every app tool that declares a rendersWidget binding is enumerated above", () => {
      const declared = appTools
        .filter((t) => t.rendersWidget)
        .map((t) => t.name)
        .sort();
      const enumerated = Object.keys(CARD_TOOL_BINDINGS).sort();
      expect(declared).toEqual(enumerated);
    });

    // Direction-2, SERVER side: a SERVER-ONLY tool (no app mirror — e.g.
    // `suggest_intent`) that declares a rendersWidget binding would slip past
    // the app-only walk above, leaving an unenumerated/unmirrored chat card.
    // Require every server tool with a binding to also be enumerated in
    // CARD_TOOL_BINDINGS. The mirrored app+server cards already pass via the
    // app walk; this closes the server-only gap. Today this filtered set is
    // empty (no server-only tool renders a widget), so the assertion holds —
    // it fires the moment a server-only binding is ever added.
    it("every SERVER-only tool that declares a rendersWidget binding is enumerated above", () => {
      const appSet = new Set(appNames);
      const serverOnlyBound = SERVER_TOOL_CATALOG.filter(
        (t) => t.rendersWidget && !appSet.has(t.name),
      )
        .map((t) => t.name)
        .sort();
      const unenumerated = serverOnlyBound.filter((n) => !(n in CARD_TOOL_BINDINGS));
      expect(
        unenumerated,
        `server-only tool(s) declare a rendersWidget binding but are not enumerated in CARD_TOOL_BINDINGS: ${unenumerated.join(", ")}`,
      ).toEqual([]);
    });
  });
});

// ── chat-architecture-hardening Task 7 — FULL-SHAPE parity ─────────────────
//
// Upgrades the guard from name+role+description+rendersWidget to the FULL
// tool shape: `category`, `availableSteps`, and the Zod input schema (both
// sides rendered to JSON-Schema via the middleware's own converter). NO
// committed manifest — the gate-answered 2026-05-31 decision stands: this
// cross-package in-suite test is the only loader that can see both catalogs
// (the app side is assembled via Vite's `import.meta.glob`).
import { convertNode } from "../../../middleware/src/services/zodToJsonSchema";
import { SERVER_TOOL_CATALOG as FULL_SERVER_CATALOG } from "../../../middleware/src/services/toolCatalog";
import { collectAppToolSpecs as collectAgain } from "./appToolSpecs";

describe("app↔server tool-catalog parity (FULL SHAPE)", () => {
  const appTools = collectAgain(
    import.meta.glob(
      [
        "../components/chat-widgets/*/*.tools.ts",
        "../components/viewer-widgets/*/*.tools.ts",
        "../views/**/*.tools.ts",
        "../components/primitives/**/*.tools.ts",
      ],
      { eager: true },
    ),
  );
  const serverByName = new Map(FULL_SERVER_CATALOG.map((t) => [t.name, t]));

  it("every app tool's category matches its server mirror", () => {
    const mismatches: string[] = [];
    for (const tool of appTools) {
      const server = serverByName.get(tool.name);
      if (!server) continue; // missing-mirror covered by the name guard
      if (server.category !== tool.category) {
        mismatches.push(`${tool.name}: app category=${tool.category} server category=${server.category}`);
      }
    }
    expect(mismatches, `category drifted app↔server:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it("every app tool's availableSteps matches its server mirror", () => {
    const mismatches: string[] = [];
    for (const tool of appTools) {
      const server = serverByName.get(tool.name);
      if (!server) continue;
      const appSteps = [...(tool.availableSteps ?? [])].sort();
      const serverSteps = [...(server.availableSteps ?? [])].sort();
      if (JSON.stringify(appSteps) !== JSON.stringify(serverSteps)) {
        mismatches.push(
          `${tool.name}: app availableSteps=${JSON.stringify(appSteps)} server=${JSON.stringify(serverSteps)}`,
        );
      }
    }
    expect(mismatches, `availableSteps drifted app↔server:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it("every app tool's input schema matches its server mirror as JSON-Schema", () => {
    const mismatches: string[] = [];
    for (const tool of appTools) {
      const server = serverByName.get(tool.name);
      if (!server) continue;
      let appJson: unknown;
      let serverJson: unknown;
      try {
        appJson = convertNode(tool.input);
      } catch (err) {
        mismatches.push(`${tool.name}: app input schema not convertible — ${String(err)}`);
        continue;
      }
      try {
        serverJson = convertNode(server.inputSchema);
      } catch (err) {
        mismatches.push(`${tool.name}: server input schema not convertible — ${String(err)}`);
        continue;
      }
      if (JSON.stringify(appJson) !== JSON.stringify(serverJson)) {
        mismatches.push(
          `${tool.name}: input schema drifted\n  app:    ${JSON.stringify(appJson)}\n  server: ${JSON.stringify(serverJson)}`,
        );
      }
    }
    expect(mismatches, `input schemas drifted app↔server (field: input):\n${mismatches.join("\n")}`).toEqual([]);
  });
});
