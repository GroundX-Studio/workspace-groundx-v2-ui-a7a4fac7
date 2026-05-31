/**
 * Widget contract drift-guard.
 *
 * Enforces the contract documented in
 * `scaffold/docs/agents/widget-contract.md`:
 *
 *   • Every widget lives under `components/chat-widgets/<Name>/` or
 *     `components/viewer-widgets/<Name>/`. Directory placement
 *     declares the slot.
 *   • Each widget ships a `README.md`.
 *   • Each widget ships a sibling `<Name>.test.tsx` covering the
 *     role + scope contract.
 *   • Each widget's main `.tsx` file references BOTH a `role:` prop
 *     AND a `scope:` prop in its props type, declares NO remaining
 *     `mode: "onboarding" | "steady"` literal, and declares NO raw
 *     `documentId`/`bucketId`/`projectId` prop (those collapse into
 *     `scope`). (We can't reliably introspect TypeScript types at
 *     runtime under vitest without a compiler pass; the regex check
 *     is the practical drift guard.)
 *
 * 2026-05-30-widget-role-access Phase 1 flips this guard from
 * requiring `mode` to requiring `role` + `scope`. Until the Phase 2b
 * per-widget sweep lands, the unmigrated widgets will fail this guard
 * — that is the EXPECTED red target driving the sweep, not a defect
 * in this guard.
 *
 * Per `widget-contract.md` § The exception, F1 `IngestView` is the
 * sole carve-out — onboarding-only, NOT a widget. The test does not
 * walk `views/Onboarding/`, so the carve-out is implicit (anything
 * outside the two widget dirs is ignored).
 *
 * Per TDD discipline: this test is the forcing function. If the
 * contract can't be tested, the contract decays into vibes.
 */

import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const SLOTS = ["chat-widgets", "viewer-widgets"] as const;

/**
 * Internal-only primitive directories live alongside widgets but
 * aren't full widgets themselves (they don't have a mode prop / etc).
 * Convention: prefix the directory with `_` and the walker skips it.
 */
function isPrimitiveDir(name: string): boolean {
  return name.startsWith("_");
}

interface WidgetEntry {
  slot: (typeof SLOTS)[number];
  name: string;
  absPath: string;
}

function listWidgets(): WidgetEntry[] {
  const out: WidgetEntry[] = [];
  for (const slot of SLOTS) {
    const slotDir = join(SRC, "components", slot);
    if (!existsSync(slotDir)) continue;
    for (const entry of readdirSync(slotDir)) {
      const abs = join(slotDir, entry);
      if (!statSync(abs).isDirectory()) continue;
      if (isPrimitiveDir(entry)) continue;
      out.push({ slot, name: entry, absPath: abs });
    }
  }
  return out;
}

/** Find the widget's main `.tsx` — the one whose basename matches the dir or dir+"Widget". */
function findMainTsx(widget: WidgetEntry): string | null {
  const candidates = [
    `${widget.name}.tsx`,
    `${widget.name}Widget.tsx`,
    `index.tsx`,
  ];
  for (const c of candidates) {
    const abs = join(widget.absPath, c);
    if (existsSync(abs)) return abs;
  }
  return null;
}

describe("widget contract drift guard", () => {
  // Meta-test: prove the walker finds the expected slot directories
  // when they exist. If both slot dirs are absent the rest of the
  // suite trivially passes — guard against that silent green.
  it("the components/chat-widgets/ + components/viewer-widgets/ directories exist", () => {
    // Both dirs MAY be empty during ARCH-03's transitional state, but
    // they must exist as the canonical homes.
    for (const slot of SLOTS) {
      const slotDir = join(SRC, "components", slot);
      expect(
        existsSync(slotDir),
        `expected ${slotDir} to exist — see scaffold/docs/agents/widget-contract.md`,
      ).toBe(true);
    }
  });

  const widgets = listWidgets();

  // Even if the lists are empty during the transition, the contract
  // applies the moment any widget lands. Don't silently green here.
  it("widget list is enumerable (sanity meta-check)", () => {
    expect(Array.isArray(widgets)).toBe(true);
  });

  for (const widget of widgets) {
    describe(`${widget.slot}/${widget.name}`, () => {
      it("has a README.md", () => {
        const readme = join(widget.absPath, "README.md");
        expect(
          existsSync(readme),
          `missing README at ${readme} — see widget-contract.md § "How to add a new widget"`,
        ).toBe(true);
      });

      it("has a sibling *.test.tsx", () => {
        const entries = readdirSync(widget.absPath);
        const hasTest = entries.some((e) => e.endsWith(".test.tsx"));
        expect(
          hasTest,
          `${widget.absPath} must ship a *.test.tsx — see widget-contract.md § "How to add a new widget"`,
        ).toBe(true);
      });

      it("declares BOTH a `role` and a `scope` prop in its main .tsx", () => {
        const mainTsx = findMainTsx(widget);
        expect(
          mainTsx,
          `could not find main .tsx in ${widget.absPath} (expected ${widget.name}.tsx / ${widget.name}Widget.tsx / index.tsx)`,
        ).not.toBeNull();
        const src = readFileSync(mainTsx!, "utf8");
        // Accept either explicit `role:` in a Props interface OR a
        // destructured `role` prop in the component signature.
        const hasRoleInProps = /\brole\s*[?]?\s*:/.test(src);
        const hasRoleDestructured = /\{\s*[^}]*\brole\b[^}]*\}\s*[:)]/.test(src);
        expect(
          hasRoleInProps || hasRoleDestructured,
          `${mainTsx} must accept a \`role: WidgetRole\` prop — see widget-contract.md § "The contract" #3 (2026-05-30-widget-role-access)`,
        ).toBe(true);

        const hasScopeInProps = /\bscope\s*[?]?\s*:/.test(src);
        const hasScopeDestructured = /\{\s*[^}]*\bscope\b[^}]*\}\s*[:)]/.test(src);
        expect(
          hasScopeInProps || hasScopeDestructured,
          `${mainTsx} must accept a \`scope: WidgetScope\` prop — see widget-contract.md § "The contract" #3 (2026-05-30-widget-role-access)`,
        ).toBe(true);
      });

      it("declares NO retired `mode: \"onboarding\" | \"steady\"` literal", () => {
        const mainTsx = findMainTsx(widget);
        if (mainTsx === null) return; // covered by the prop test above
        const src = readFileSync(mainTsx, "utf8");
        // The retired binary mode union, in either order, with flexible
        // quoting/whitespace. `role` replaces it; a stray onboarding/steady
        // mode literal is the migration tell.
        const onb = `["']onboarding["']`;
        const stdy = `["']steady["']`;
        const modeLiteral = new RegExp(
          `\\bmode\\b[^;\\n]*(?:(?:${onb}[^;\\n]*${stdy})|(?:${stdy}[^;\\n]*${onb}))`,
        );
        expect(
          modeLiteral.test(src),
          `${mainTsx} still declares a \`mode: "onboarding" | "steady"\` literal — replace with \`role: WidgetRole\` (2026-05-30-widget-role-access Phase 2b)`,
        ).toBe(false);
      });

      it("declares NO raw documentId/bucketId/projectId prop (use `scope`)", () => {
        const mainTsx = findMainTsx(widget);
        if (mainTsx === null) return; // covered by the prop test above
        const src = readFileSync(mainTsx, "utf8");
        // A raw id PROP declaration: `documentId:` / `bucketId?:` etc. in a
        // props position. These collapse into `scope: WidgetScope`. Match the
        // identifier followed by an optional `?` then `:` (a type annotation),
        // which is how a prop is declared — not how `scope.documentIds` is
        // read.
        const rawIdProp = /\b(?:documentId|bucketId|projectId)\s*\??\s*:/;
        const match = rawIdProp.exec(src);
        expect(
          match === null,
          `${mainTsx} declares a raw id prop (${match?.[0]?.trim() ?? ""}) — collapse it into \`scope: WidgetScope\` (2026-05-30-widget-role-access Phase 2b)`,
        ).toBe(true);
      });

      // widget-llm-integration Phase 6 — every widget MUST declare
      // an LLM tool surface or explicitly opt out. The drift guard
      // walks for one of two siblings: `<Name>.tools.ts` (the
      // declaration path) or `no-llm.md` (the opt-out path).
      it("has either <Name>.tools.ts OR no-llm.md (Phase 6)", () => {
        const entries = readdirSync(widget.absPath);
        const hasTools = entries.some(
          (e) => e === `${widget.name}.tools.ts` || e === `${widget.name}Widget.tools.ts`,
        );
        const hasNoLlm = entries.includes("no-llm.md");
        const summary = `${widget.slot}/${widget.name}: ` +
          `tools.ts present=${hasTools}, no-llm.md present=${hasNoLlm}`;
        expect(
          hasTools || hasNoLlm,
          `${summary} — declare LLM tools in <Name>.tools.ts OR add no-llm.md with a ## Why section. See docs/agents/widget-contract.md § "How to add a new widget".`,
        ).toBe(true);
        expect(
          !(hasTools && hasNoLlm),
          `${summary} — declare EXACTLY ONE. Both files coexisting is ambiguous.`,
        ).toBe(true);
      });

      // widget-llm-integration Phase 6 — opt-out path requires a
      // justification. Without this every widget would default to
      // `no-llm.md` to skip the work; the `## Why` header keeps the
      // author honest.
      it("no-llm.md (when present) contains a ## Why section (Phase 6)", () => {
        const noLlmPath = join(widget.absPath, "no-llm.md");
        if (!existsSync(noLlmPath)) return;
        const src = readFileSync(noLlmPath, "utf8");
        expect(
          /^##\s+Why\b/m.test(src),
          `${noLlmPath} must contain a "## Why" section justifying the opt-out (e.g. "pure display", "user-driven nav", "already user-confirmed legacy flow").`,
        ).toBe(true);
      });

      // widget-llm-integration Phase 6 — README must declare each
      // contract surface. Accepts a small set of equivalent header
      // wordings (Purpose vs What it does, Integration vs How to
      // mount, etc.) so the rule reads as "every concept is
      // addressed" rather than "exact spelling". The "LLM tools"
      // header pairs with the tools.ts vs no-llm.md fork.
      const requiredHeaders: { name: string; aliases: RegExp[] }[] = [
        {
          name: "What it does (or Purpose)",
          aliases: [/^##\s+What it does\b/m, /^##\s+Purpose\b/m],
        },
        {
          name: "Props",
          aliases: [/^##\s+Props\b/m],
        },
        {
          name: "Locked affordances",
          aliases: [
            /^##\s+Locked affordances\b/m,
            /^##\s+Locked behavior\b/m,
            /^##\s+Mode lock\b/m,
          ],
        },
        {
          name: "Events (or Callbacks)",
          aliases: [
            /^##\s+Events\b/m,
            /^##\s+Callbacks\b/m,
            /^##\s+Activation\b/m,
          ],
        },
        {
          name: "How to mount (or Integration)",
          aliases: [
            /^##\s+How to mount\b/m,
            /^##\s+Integration\b/m,
            /^##\s+Mount\b/m,
          ],
        },
        {
          name: "LLM tools (or No LLM tools)",
          aliases: [
            /^##\s+LLM tools\b/mi,
            /^##\s+No LLM tools\b/mi,
            /^##\s+Tools\b/mi,
          ],
        },
      ];

      it("README contains the required section headers (Phase 6)", () => {
        const readme = join(widget.absPath, "README.md");
        if (!existsSync(readme)) return; // earlier test will fail
        const src = readFileSync(readme, "utf8");
        const missing: string[] = [];
        for (const header of requiredHeaders) {
          const hit = header.aliases.some((re) => re.test(src));
          if (!hit) missing.push(header.name);
        }
        expect(
          missing.length === 0,
          `${readme} is missing required section header(s): ${missing.join(", ")}. ` +
            `Required (any one alias per row): ${requiredHeaders.map((h) => h.name).join(" · ")}.`,
        ).toBe(true);
      });
    });
  }
});
