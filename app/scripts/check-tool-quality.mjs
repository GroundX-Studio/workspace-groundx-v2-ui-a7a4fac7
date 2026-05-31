#!/usr/bin/env node
/**
 * widget-llm-integration Phase 5b — tool-author quality gate.
 *
 * Per design.md §F, the LLM only sees three things per tool: `name`,
 * `description`, and the per-parameter `.describe()` strings on the
 * Zod schema. Sloppy values directly degrade tool-selection accuracy.
 *
 * Four rules enforced:
 *
 *   1. Globally unique name (the registry already errors at runtime;
 *      this check restates it at build time so a duplicate fails the
 *      `npm test` gate, not just app boot).
 *   2. snake_case + allowlisted action-verb prefix.
 *   3. Description ≥ 40 chars AND contains "Use when" or
 *      "Triggers when" (case-insensitive).
 *   4. Every Zod field on the `input` schema carries a non-empty
 *      `.describe(...)` call.
 *
 * Rules 2–4 are enforced via lightweight textual parsing of the
 * `<Name>.tools.ts` source — no module import, no React boot. Rule 1
 * walks all collected names and looks for duplicates.
 *
 * Failure messages name the tool, the owning widget path, the rule
 * that fired, and a suggested fix.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");
const SRC = resolve(APP_ROOT, "src");

const ALLOWED_VERBS = [
  // `show_` — the canonical canvas-dispatch verb for ALL ScopedViewerWidgets
  // (`show_understand` / `show_document` / `show_extraction`(+`_edit`) /
  // `show_smart_report_render`(+`_edit`) / `show_integrate`). Allowlisted ONCE
  // here by 2026-05-29-smart-report-screen Phase 5 (the first real `show_*`
  // tools), per the agent-tools spec "The verb allowlist SHALL admit `show_`".
  "show_",
  "open_",
  "jump_",
  "propose_",
  "accept_",
  "dismiss_",
  "save_",
  "send_",
  "pick_",
  "pivot_",
  "highlight_",
  "commit_",
  "book_",
  "edit_",
  "pin_",
  "run_",
  "reject_",
  "cancel_",
  "delete_",
  // 2026-05-31-tool-system-completion — the deferred view/primitive tools.
  // `submit_` (SignUpWidget submit), `wizard_` (OnboardingWizard nav), and
  // `close_` (DialogTitle close) per the agent-tools spec "The verb allowlist
  // SHALL admit submit_, wizard_, and close_".
  "submit_",
  "wizard_",
  "close_",
];

/**
 * Tool-discovery homes — the SAME shape as `TOOL_GLOB_PATTERNS` in
 * `src/tools/registry.ts` and `collectKnownToolNames` in
 * `check-tool-references.mjs`. The two widget slots PLUS the view-hosted
 * (`views/**`) and primitive-hosted (`components/primitives/**`) homes added by
 * 2026-05-31-tool-system-completion (BROAD glob-home), so OnboardingWizard +
 * DialogTitle tools are scanned in place. `registry.test.ts` asserts the
 * registry's list; this list is restated here (a `.mjs` script can't import the
 * TS const) and kept identical — the three walkers cannot drift.
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
      // `components/primitives` is nested under `components`, but the widget
      // slots are siblings — no path is reachable from two homes. Dedupe
      // defensively anyway so a future overlapping home can't double-count.
      if (seen.has(file)) continue;
      seen.add(file);
      yield file;
    }
  }
}

/**
 * Lightweight tool extractor. Each tool literal looks like:
 *
 *   const X: WidgetTool = {
 *     name: "open_document",
 *     description: "Open a document... Use when ...",
 *     category: "read",
 *     input: z.object({
 *       documentId: z.string().min(1).describe("..."),
 *       page: z.number()...
 *     }),
 *     ...
 *   };
 *
 * We don't try to fully parse TS — we just slice each declaration's
 * brace span and walk its content with focused regexes.
 */
function extractTools(src, file) {
  const tools = [];
  // Find each top-level WidgetTool literal — match `const ... : WidgetTool = {`.
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*:\s*WidgetTool(?:<[^>]+>)?\s*=\s*\{/g)) {
    const startBrace = m.index + m[0].length - 1;
    // Scan for the matching closing brace (string-aware + brace-counting).
    let depth = 1;
    let inString = null;
    let escape = false;
    let endBrace = -1;
    for (let i = startBrace + 1; i < src.length; i += 1) {
      const c = src[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (inString) {
        if (c === inString) inString = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inString = c;
        continue;
      }
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          endBrace = i;
          break;
        }
      }
    }
    if (endBrace < 0) continue;
    const body = src.slice(startBrace + 1, endBrace);
    const nameMatch = body.match(/\bname:\s*["']([^"']+)["']/);
    const descMatch = body.match(/\bdescription:\s*([^,}\n][^,]*)/);
    // For multi-line concatenated descriptions, grab all consecutive
    // `"..."` / `'...'` segments separated by `+`.
    const descConcatMatch = body.match(/\bdescription:\s*((?:["'][^"']*["']\s*\+?\s*)+)/);
    const description = descConcatMatch
      ? descConcatMatch[1]
          .match(/["']([^"']*)["']/g)
          .map((s) => s.slice(1, -1))
          .join("")
      : null;
    if (!nameMatch) continue;
    // Find the `input: z.object({ ... })` shape and the .describe()
    // coverage. We just lift the substring between `input:` and the
    // matching close of that object literal.
    const inputStart = body.search(/\binput:\s*z\.object\s*\(\s*\{/);
    let inputObj = null;
    if (inputStart >= 0) {
      const objStart = body.indexOf("{", inputStart);
      if (objStart >= 0) {
        let d = 1;
        let s = null;
        let endObj = -1;
        for (let i = objStart + 1; i < body.length; i += 1) {
          const c = body[i];
          if (s) {
            if (c === s) s = null;
          } else if (c === '"' || c === "'" || c === "`") s = c;
          else if (c === "{") d += 1;
          else if (c === "}") {
            d -= 1;
            if (d === 0) {
              endObj = i;
              break;
            }
          }
        }
        if (endObj > 0) inputObj = body.slice(objStart + 1, endObj);
      }
    }
    tools.push({
      file: relative(APP_ROOT, file),
      name: nameMatch[1],
      description: description ?? "",
      inputObj,
    });
  }
  return tools;
}

function checkOneTool(tool) {
  const failures = [];
  const { file, name, description, inputObj } = tool;

  // Rule 2: snake_case + allowlisted verb prefix.
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    failures.push({
      tool: name,
      file,
      rule: "name shape",
      message: "tool name must match /^[a-z][a-z0-9_]*$/ (snake_case)",
    });
  }
  const hasVerb = ALLOWED_VERBS.some((v) => name.startsWith(v));
  if (!hasVerb) {
    failures.push({
      tool: name,
      file,
      rule: "name verb prefix",
      message: `tool name must start with one of: ${ALLOWED_VERBS.join(", ")}`,
    });
  }

  // Rule 3: description quality.
  if (description.length < 40) {
    failures.push({
      tool: name,
      file,
      rule: "description length",
      message: `description is ${description.length} chars; min 40. Spell out behavior + when to invoke.`,
    });
  }
  if (!/use when|triggers when/i.test(description)) {
    failures.push({
      tool: name,
      file,
      rule: "description 'Use when' clause",
      message: 'description must include "Use when …" or "Triggers when …" — this is the most impactful field for LLM tool-selection accuracy.',
    });
  }

  // Rule 4: every Zod field carries .describe(...).
  if (inputObj !== null) {
    // Identify each top-level field declaration: `<key>: z.<...>`
    // and require a `.describe("...")` somewhere in its line(s).
    // Lightweight: split on commas at depth 0.
    const fields = splitTopLevelFields(inputObj);
    for (const f of fields) {
      const keyMatch = f.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
      if (!keyMatch) continue;
      if (!/\.describe\s*\(\s*["'`]/.test(f)) {
        failures.push({
          tool: name,
          file,
          rule: `Zod .describe() on field ${keyMatch[1]}`,
          message: `every field on the input schema must call .describe("..."). Add it on field "${keyMatch[1]}".`,
        });
      }
    }
  }

  return failures;
}

function splitTopLevelFields(text) {
  const parts = [];
  let depth = 0;
  let inString = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") depth += 1;
    else if (c === "}" || c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.filter((p) => p.trim().length > 0);
}

function main() {
  const allTools = [];
  for (const file of collectToolFiles()) {
    const src = readFileSync(file, "utf8");
    allTools.push(...extractTools(src, file));
  }

  // Rule 1: globally unique names.
  const seen = new Map();
  const dupFailures = [];
  for (const t of allTools) {
    const prior = seen.get(t.name);
    if (prior) {
      dupFailures.push({
        tool: t.name,
        file: t.file,
        rule: "name uniqueness",
        message: `duplicate tool name. Also declared in ${prior.file}.`,
      });
    } else {
      seen.set(t.name, t);
    }
  }

  const failures = [];
  failures.push(...dupFailures);
  for (const t of allTools) failures.push(...checkOneTool(t));

  if (failures.length === 0) {
    return 0;
  }
  console.error(`check-tool-quality: ${failures.length} rule violation(s).`);
  for (const f of failures) {
    console.error(
      `  ${f.file}  [${f.tool}]  ${f.rule}\n    ${f.message}`,
    );
  }
  return 1;
}

process.exit(main());
