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
 *     mode contract.
 *   • Each widget's main `.tsx` file references `mode:` in its
 *     props type. (We can't reliably introspect TypeScript types at
 *     runtime under vitest without a compiler pass; the regex check
 *     is the practical drift guard.)
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

      it("declares a `mode` prop in its main .tsx", () => {
        const mainTsx = findMainTsx(widget);
        expect(
          mainTsx,
          `could not find main .tsx in ${widget.absPath} (expected ${widget.name}.tsx / ${widget.name}Widget.tsx / index.tsx)`,
        ).not.toBeNull();
        const src = readFileSync(mainTsx!, "utf8");
        // Accept either explicit `mode:` in a Props interface OR
        // a destructured `mode` prop in the component signature.
        const hasModeInProps = /mode\s*[?:]?\s*:/.test(src);
        const hasModeDestructured = /\{\s*[^}]*\bmode\b[^}]*\}\s*[:)]/.test(src);
        expect(
          hasModeInProps || hasModeDestructured,
          `${mainTsx} must accept a \`mode\` prop — see widget-contract.md § "The contract" #3`,
        ).toBe(true);
      });
    });
  }
});
