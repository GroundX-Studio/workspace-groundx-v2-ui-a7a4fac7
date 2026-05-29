#!/usr/bin/env node
/**
 * widget-llm-integration Phase 5b — self-test for
 * check-tool-quality.mjs. Drops a temporary `.tools.ts` fixture under
 * a `_quality_fixture` widget dir (which the drift guard ignores), runs
 * the script, and asserts each of the four quality rules fires on a
 * bad fixture and passes on a conforming one.
 *
 * Quality script walks `chat-widgets/` + `viewer-widgets/`, skipping
 * `_`-prefixed entries. To exercise it we need a NON-underscored
 * fixture dir — but the widget-contract drift guard would then also
 * walk it. Workaround: create the fixture, run the check, and delete
 * immediately. The widget-contract test isn't running at this point.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function runScript() {
  try {
    const out = execFileSync("node", ["scripts/check-tool-quality.mjs"], {
      cwd: APP_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function withFixture(name, body, fn) {
  const dir = resolve(
    APP_ROOT,
    `src/components/chat-widgets/QualityFixture_${name}`,
  );
  mkdirSync(dir, { recursive: true });
  const toolsFile = join(dir, `QualityFixture_${name}.tools.ts`);
  writeFileSync(toolsFile, body);
  try {
    return fn();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Test 1 — current tree passes.
{
  const r = runScript();
  assert(r.code === 0, `expected current tree to pass, got code=${r.code} stderr=${r.stderr}`);
}

// Test 2 — bad name shape (PascalCase) fires.
withFixture("BadName", `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "OpenDocument",
  description: "Open a document. Use when the user wants the doc.",
  category: "read",
  input: z.object({ id: z.string().describe("doc id") }),
  handler: () => null,
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 1, "expected PascalCase name to fail");
  assert(r.stderr.includes("name shape"), `expected 'name shape' rule, got: ${r.stderr}`);
});

// Test 3 — name without allowlisted verb prefix fires.
withFixture("BadVerb", `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "frobnicate_thing",
  description: "Frobnicate a thing. Use when frobnication is needed.",
  category: "read",
  input: z.object({ id: z.string().describe("doc id") }),
  handler: () => null,
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 1, "expected non-allowlisted verb to fail");
  assert(r.stderr.includes("name verb prefix"), `expected 'name verb prefix' rule, got: ${r.stderr}`);
});

// Test 4 — short description fires.
withFixture("ShortDesc", `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "open_thing",
  description: "open the thing.",
  category: "read",
  input: z.object({ id: z.string().describe("doc id") }),
  handler: () => null,
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 1, "expected short description to fail");
  assert(r.stderr.includes("description length"), `expected 'description length' rule, got: ${r.stderr}`);
});

// Test 5 — description without 'Use when' fires.
withFixture("NoUseWhen", `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "open_thing",
  description: "Opens the thing in the viewer with a generic narrative description that has plenty of words.",
  category: "read",
  input: z.object({ id: z.string().describe("doc id") }),
  handler: () => null,
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 1, "expected missing Use-when to fail");
  assert(r.stderr.includes("'Use when' clause"), `expected 'Use when' rule, got: ${r.stderr}`);
});

// Test 6 — Zod field without .describe() fires.
withFixture("NoDescribe", `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "open_thing",
  description: "Open the thing. Use when the user references it by name.",
  category: "read",
  input: z.object({ id: z.string() }),
  handler: () => null,
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 1, "expected missing .describe() to fail");
  assert(r.stderr.includes(".describe()"), `expected .describe() rule, got: ${r.stderr}`);
});

// Test 7 — conforming tool passes alongside the production catalog.
withFixture("Ok", `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "open_quality_fixture",
  description: "Open the quality fixture surface. Use when the test runs.",
  category: "read",
  input: z.object({ id: z.string().describe("identifier") }),
  handler: () => null,
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 0, `expected conforming fixture to pass, got code=${r.code} stderr=${r.stderr}`);
});

if (failures.length === 0) {
  console.log("check-tool-quality.test.mjs: all assertions passed");
  process.exit(0);
}
console.error("check-tool-quality.test.mjs: failures:");
for (const f of failures) console.error("  -", f);
process.exit(1);
