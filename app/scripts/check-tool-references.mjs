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
function collectKnownToolNames() {
  const known = new Set();
  const slots = ["chat-widgets", "viewer-widgets"];
  for (const slot of slots) {
    const slotDir = join(SRC, "components", slot);
    let entries;
    try {
      entries = readdirSync(slotDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith("_")) continue;
      const widgetDir = join(slotDir, entry);
      let widgetEntries;
      try {
        widgetEntries = readdirSync(widgetDir);
      } catch {
        continue;
      }
      for (const file of widgetEntries) {
        if (!file.endsWith(".tools.ts")) continue;
        const src = readFileSync(join(widgetDir, file), "utf8");
        // Lift the tool name literal from each `name: "<...>"` declaration.
        for (const m of src.matchAll(/\bname:\s*["']([a-z][a-z0-9_]*)["']/g)) {
          known.add(m[1]);
        }
      }
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
