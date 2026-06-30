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
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 0, `expected conforming fixture to pass, got code=${r.code} stderr=${r.stderr}`);
});

// Test 8 — smart-report Phase 5: the `show_` canvas-dispatch verb is
// allowlisted (the canonical verb for all ScopedViewerWidgets). A
// `show_smart_report_render` tool passes the verb-prefix rule.
withFixture("ShowVerb", `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "show_quality_fixture",
  description: "Move the canvas to the quality fixture surface. Use when the test exercises the show_ verb.",
  category: "read",
  input: z.object({ scopeKey: z.string().describe("scope identity key") }),
};
export const tools = [t];
`, () => {
  const r = runScript();
  assert(r.code === 0, `expected show_ prefix to pass, got code=${r.code} stderr=${r.stderr}`);
});

// Test 9 — tool-system-completion: the deferred view/primitive tool
// verbs (`submit_`, `wizard_`, `close_`) are allowlisted so the
// SignUpWidget submit / OnboardingWizard nav / DialogTitle close tools
// pass the verb-prefix rule.
for (const [verb, name] of [
  ["submit_", "submit_quality_fixture"],
  ["wizard_", "wizard_quality_fixture"],
  ["close_", "close_quality_fixture"],
]) {
  withFixture(`Verb_${verb}`, `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "${name}",
  description: "Exercises the ${verb} verb prefix. Use when the test asserts the new verb taxonomy passes.",
  category: "read",
  input: z.object({ id: z.string().describe("identifier") }),
};
export const tools = [t];
`, () => {
    const r = runScript();
    assert(r.code === 0, `expected ${verb} prefix to pass, got code=${r.code} stderr=${r.stderr}`);
  });
}

// Test 10 — 2026-05-31-tool-system-completion glob-home (BROAD): the
// quality scanner walks view-hosted (views/**) and primitive-hosted
// (components/primitives/**) `*.tools.ts`, so tools placed there are
// subject to the SAME rules as widget tools. We drop a tool with a
// non-allowlisted verb in each home and assert the scanner FIRES on it
// (proving collectToolFiles learned the home — a no-op walker would
// silently pass).
function withHomeFixture(absDir, fileName, body, fn) {
  mkdirSync(absDir, { recursive: true });
  const toolsFile = join(absDir, fileName);
  writeFileSync(toolsFile, body);
  try {
    return fn();
  } finally {
    rmSync(absDir, { recursive: true, force: true });
  }
}

const BAD_VERB_TOOL = `
import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "frobnicate_glob_home",
  description: "Frobnicate the glob-home fixture. Use when the scanner checks a non-widget home.",
  category: "read",
  input: z.object({ id: z.string().describe("identifier") }),
};
export const tools = [t];
`;

withHomeFixture(
  resolve(APP_ROOT, "src/views/QualityHomeFixtureView"),
  "QualityHomeFixtureView.tools.ts",
  BAD_VERB_TOOL,
  () => {
    const r = runScript();
    assert(r.code === 1, "expected a view-hosted bad-verb tool to be scanned + fail");
    assert(
      r.stderr.includes("name verb prefix"),
      `expected the scanner to evaluate the view-hosted tool, got: ${r.stderr}`,
    );
  },
);

withHomeFixture(
  resolve(APP_ROOT, "src/components/primitives/QualityHomeFixturePrimitive"),
  "QualityHomeFixturePrimitive.tools.ts",
  BAD_VERB_TOOL,
  () => {
    const r = runScript();
    assert(r.code === 1, "expected a primitive-hosted bad-verb tool to be scanned + fail");
    assert(
      r.stderr.includes("name verb prefix"),
      `expected the scanner to evaluate the primitive-hosted tool, got: ${r.stderr}`,
    );
  },
);

if (failures.length === 0) {
  console.log("check-tool-quality.test.mjs: all assertions passed");
  process.exit(0);
}
console.error("check-tool-quality.test.mjs: failures:");
for (const f of failures) console.error("  -", f);
process.exit(1);
