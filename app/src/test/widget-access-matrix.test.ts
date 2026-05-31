/**
 * Widget access-matrix COVERAGE guard.
 *
 * 2026-05-30-widget-role-access Phase 2a.
 *
 * Enforces that `docs/agents/widget-access-matrix.md` stays in sync
 * with the code: every widget directory under
 * `components/chat-widgets/` + `components/viewer-widgets/` AND every
 * LLM tool declared across the `*.tools.ts` files MUST have a row in
 * the matrix. No silent omissions — the matrix is the reviewed
 * source of truth for who-can-access-what, so a new widget or tool
 * that never lands in the matrix is a coverage hole, not a feature.
 *
 * This is the forcing function for the "Keep the matrix in sync when
 * widgets/tools are added" tasks.md line. If a widget/tool can be
 * added without a matrix row, the matrix decays into a stale doc.
 *
 * Mechanics: the matrix is markdown. We extract the set of
 * first-column table cells (widget rows) and tool-name table cells
 * (the `| tool | widget | … |` rows in § "Tool access"), normalising
 * away `**bold**` and `` `code` `` decoration, and assert that every
 * code-discovered widget dir + tool name is present in that set.
 */

import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const REPO_ROOT = resolve(SRC, "..", "..");
const MATRIX_PATH = resolve(
  REPO_ROOT,
  "docs",
  "agents",
  "widget-access-matrix.md",
);
const SLOTS = ["chat-widgets", "viewer-widgets"] as const;

/** `_`-prefixed dirs are internal primitives, not widgets (mirrors widget-contract.test.ts). */
function isPrimitiveDir(name: string): boolean {
  return name.startsWith("_");
}

/** Widget directory names under the two widget slots. */
function listWidgetNames(): string[] {
  const out: string[] = [];
  for (const slot of SLOTS) {
    const slotDir = join(SRC, "components", slot);
    if (!existsSync(slotDir)) continue;
    for (const entry of readdirSync(slotDir)) {
      const abs = join(slotDir, entry);
      if (!statSync(abs).isDirectory()) continue;
      if (isPrimitiveDir(entry)) continue;
      out.push(entry);
    }
  }
  return out;
}

/**
 * Every `*.tools.ts` under components/ (including the `_template`
 * reference scaffold — its tools ARE in the matrix) and the tool
 * `name: "…"` literals they declare.
 */
function listToolNames(): string[] {
  const names: string[] = [];
  const componentsDir = join(SRC, "components");
  const nameRe = /\bname:\s*"([a-z][a-z0-9_]*)"/g;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.endsWith(".tools.ts")) continue;
      const src = readFileSync(abs, "utf8");
      let m: RegExpExecArray | null;
      while ((m = nameRe.exec(src)) !== null) {
        names.push(m[1]);
      }
    }
  }

  if (existsSync(componentsDir)) walk(componentsDir);
  return [...new Set(names)];
}

/** Strip `**bold**` and `` `code` `` decoration + surrounding whitespace. */
function normalizeCell(cell: string): string {
  return cell
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

/**
 * Collect the set of normalised table-cell tokens that act as row
 * keys in the matrix:
 *   • first column of every `| … |` table row, AND
 *   • second column too (covers the `| tool | widget | … |` shape
 *     where the widget is the 2nd cell — harmless extra coverage).
 * A separator row (`|---|`) is skipped.
 */
function matrixRowKeys(matrix: string): Set<string> {
  const keys = new Set<string>();
  for (const line of matrix.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // Split into cells; drop the empty leading/trailing from the pipes.
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => normalizeCell(c));
    if (cells.length === 0) continue;
    // Skip the `---`/`:--:` alignment separator row.
    if (cells.every((c) => /^:?-+:?$/.test(c) || c === "")) continue;
    // First two columns are where row keys (widget / tool) live.
    if (cells[0]) keys.add(cells[0]);
    if (cells[1]) keys.add(cells[1]);
  }
  return keys;
}

describe("widget access matrix coverage", () => {
  it("the matrix doc exists", () => {
    expect(
      existsSync(MATRIX_PATH),
      `expected ${MATRIX_PATH} to exist (docs/agents/widget-access-matrix.md)`,
    ).toBe(true);
  });

  const matrix = existsSync(MATRIX_PATH)
    ? readFileSync(MATRIX_PATH, "utf8")
    : "";
  const rowKeys = matrixRowKeys(matrix);
  const widgets = listWidgetNames();
  const tools = listToolNames();

  // Sanity meta-checks — guard against a silent-green where the
  // enumerators find nothing.
  it("discovers at least one widget and one tool (sanity)", () => {
    expect(widgets.length).toBeGreaterThan(0);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("every widget directory has a row in the matrix", () => {
    const missing = widgets.filter((w) => !rowKeys.has(w));
    expect(
      missing.length === 0,
      `widget(s) missing from docs/agents/widget-access-matrix.md: ` +
        `${missing.join(", ")}. Add a row in § "Widget availability" + § "Scope stance" ` +
        `(no silent omissions — see 2026-05-30-widget-role-access Phase 2a).`,
    ).toBe(true);
  });

  it("every declared tool has a row in the matrix", () => {
    const missing = tools.filter((t) => !rowKeys.has(t));
    expect(
      missing.length === 0,
      `tool(s) missing from docs/agents/widget-access-matrix.md: ` +
        `${missing.join(", ")}. Add a row in § "Tool access" (\`availableIn\`) ` +
        `(no silent omissions — see 2026-05-30-widget-role-access Phase 2a).`,
    ).toBe(true);
  });
});
