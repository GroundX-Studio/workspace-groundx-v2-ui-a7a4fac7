#!/usr/bin/env node
/**
 * widget-llm-integration Phase 5b — tool-reference integrity check.
 *
 * Walks every `.tsx` file under `src/components/` + `src/views/`,
 * extracts every `tool="..."` literal from JSX attributes, and asserts
 * each name resolves to a tool declared in some widget's
 * `<Name>.tools.ts`. Fires a "did you mean?" suggestion when a value
 * is close (Levenshtein ≤ 2) to a real tool name.
 *
 * Used as a pre-test hook (`npm test` runs this before vitest). Failures
 * exit non-zero with a clear, locatable error.
 *
 * Companion to `check-tool-quality.mjs`, which enforces author-side
 * tool-declaration quality (naming, description, .describe() on Zod
 * fields).
 *
 * Phase 7 backfill is the proper home for upgrading
 * `noTool="legacy …"` strings to real `tool="…"` references. This
 * check fires AFTER that upgrade — it doesn't object to `noTool=`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");
const SRC = resolve(APP_ROOT, "src");

/**
 * Walk a directory recursively, yielding absolute file paths.
 */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      // Skip `_*` directories (template, etc.) — they don't ship.
      if (entry.startsWith("_")) continue;
      yield* walk(abs);
    } else if (stat.isFile()) {
      yield abs;
    }
  }
}

/**
 * Collect the authoritative tool names from every `*.tools.ts` file
 * under `src/components/{chat-widgets,viewer-widgets}/`. We parse the
 * file text rather than importing the module so the check can run
 * without booting the React runtime.
 */
/**
 * Tool-discovery homes — the SAME shape as `TOOL_GLOB_PATTERNS` in
 * `src/tools/registry.ts` and `collectToolFiles` in `check-tool-quality.mjs`.
 * The two widget slots PLUS the view-hosted (`views/**`) and primitive-hosted
 * (`components/primitives/**`) homes added by 2026-05-31-tool-system-completion
 * (BROAD glob-home). Restated here (a `.mjs` can't import the TS const) and
 * kept identical so the three walkers cannot drift.
 */
const TOOL_HOMES = [
  resolve(SRC, "components", "chat-widgets"),
  resolve(SRC, "components", "viewer-widgets"),
  resolve(SRC, "views"),
  resolve(SRC, "components", "primitives"),
];

/** Recursively yield every `*.tools.ts` under `dir`, skipping `_`-prefixed dirs. */
function* walkToolFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith("_")) continue;
    const abs = join(dir, entry);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      yield* walkToolFiles(abs);
    } else if (stat.isFile() && entry.endsWith(".tools.ts")) {
      yield abs;
    }
  }
}

function* collectToolFiles() {
  const seen = new Set();
  for (const home of TOOL_HOMES) {
    for (const file of walkToolFiles(home)) {
      if (seen.has(file)) continue;
      seen.add(file);
      yield file;
    }
  }
}

function collectKnownToolNames() {
  const known = new Set();
  for (const file of collectToolFiles()) {
    const src = readFileSync(file, "utf8");
    // Lift the tool name literal from each `name: "<...>"` declaration.
    for (const m of src.matchAll(/\bname:\s*["']([a-z][a-z0-9_]*)["']/g)) {
      known.add(m[1]);
    }
  }
  return known;
}

/**
 * Extract every `tool="..."` reference from a JSX file. Returns an
 * array of `{ name, line, col }` entries. Skips occurrences inside
 * comments (line + block).
 */
function extractToolRefs(src) {
  const refs = [];
  // Strip block + line comments crudely. This is good enough for
  // JSX where `tool=` is a JSX attribute, never a substring inside
  // a string literal that a regex would catch by accident.
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  let lineStart = 0;
  let line = 1;
  for (let i = 0; i < stripped.length; i += 1) {
    if (stripped[i] === "\n") {
      line += 1;
      lineStart = i + 1;
      continue;
    }
    // Match `\btool=` then a quoted string.
    if (
      stripped.slice(i, i + 5) === "tool=" &&
      (i === 0 || /[\s({,]/.test(stripped[i - 1])) &&
      (stripped[i + 5] === '"' || stripped[i + 5] === "'")
    ) {
      const quote = stripped[i + 5];
      const end = stripped.indexOf(quote, i + 6);
      if (end < 0) continue;
      const name = stripped.slice(i + 6, end);
      refs.push({ name, line, col: i - lineStart + 1 });
      i = end;
    }
  }
  return refs;
}

/** Levenshtein distance, capped at 3 for early-exit. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 4;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) dp[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[b.length];
}

function nearest(name, known) {
  let best = null;
  let bestD = 3;
  for (const k of known) {
    const d = levenshtein(name, k);
    if (d < bestD) {
      best = k;
      bestD = d;
    }
  }
  return best;
}

function main() {
  const known = collectKnownToolNames();
  const failures = [];
  for (const file of walk(SRC)) {
    if (!file.endsWith(".tsx")) continue;
    if (file.endsWith(".test.tsx") || file.endsWith(".test-d.tsx")) continue;
    if (file.includes(`${"_template"}`)) continue;
    const src = readFileSync(file, "utf8");
    const refs = extractToolRefs(src);
    for (const ref of refs) {
      if (known.has(ref.name)) continue;
      failures.push({
        file: relative(APP_ROOT, file),
        line: ref.line,
        col: ref.col,
        name: ref.name,
        suggestion: nearest(ref.name, known),
      });
    }
  }
  if (failures.length === 0) {
    return 0;
  }
  console.error(
    `check-tool-references: ${failures.length} unresolved tool reference(s).`,
  );
  for (const f of failures) {
    const hint = f.suggestion ? ` — did you mean "${f.suggestion}"?` : "";
    console.error(
      `  ${f.file}:${f.line}:${f.col}  tool="${f.name}"${hint}`,
    );
  }
  console.error(
    `\nAdd the tool declaration in the owning widget's <Name>.tools.ts, or change the reference to a known tool name. The authoritative list comes from src/components/{chat-widgets,viewer-widgets}/*/*.tools.ts.`,
  );
  return 1;
}

process.exit(main());
