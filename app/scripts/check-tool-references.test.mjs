#!/usr/bin/env node
/**
 * widget-llm-integration Phase 5b — self-test for
 * check-tool-references.mjs. Runs the script against a temporary
 * fixture tree and asserts it fires on unknown tools + suggests near
 * matches.
 *
 * Run via `node scripts/check-tool-references.test.mjs` from the app
 * workspace. Non-zero exit on any failed assertion.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function runScript(extraArg) {
  try {
    const out = execFileSync("node", ["scripts/check-tool-references.mjs", ...(extraArg ? [extraArg] : [])], {
      cwd: APP_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

// Test 1 — current tree passes (no unknown refs today).
{
  const r = runScript();
  assert(r.code === 0, `expected current tree to pass, got code=${r.code}, stderr=${r.stderr}`);
}

// Test 2 — inject an unknown tool reference into a fixture file and
// assert the script fires.
const fixtureFile = resolve(APP_ROOT, "src/views/Onboarding/__check_tool_refs_fixture__.tsx");
mkdirSync(dirname(fixtureFile), { recursive: true });
writeFileSync(
  fixtureFile,
  `import { Button } from "@/components/primitives/Button/Button";
export const Probe = () => <Button tool="open_documnt">probe</Button>;
`,
);
try {
  const r = runScript();
  assert(r.code === 1, `expected fixture to fail, got code=${r.code}`);
  assert(
    r.stderr.includes('tool="open_documnt"'),
    `expected stderr to name the typo, got: ${r.stderr}`,
  );
  assert(
    r.stderr.includes('did you mean "open_document"'),
    `expected did-you-mean suggestion, got: ${r.stderr}`,
  );
} finally {
  rmSync(fixtureFile, { force: true });
}

// Test 3 — a fixture with a correct tool name passes.
const fixtureFile2 = resolve(APP_ROOT, "src/views/Onboarding/__check_tool_refs_fixture2__.tsx");
writeFileSync(
  fixtureFile2,
  `import { Button } from "@/components/primitives/Button/Button";
export const ProbeOk = () => <Button tool="open_document">probe</Button>;
`,
);
try {
  const r = runScript();
  assert(r.code === 0, `expected correct tool name to pass, got code=${r.code}, stderr=${r.stderr}`);
} finally {
  rmSync(fixtureFile2, { force: true });
}

if (failures.length === 0) {
  console.log("check-tool-references.test.mjs: all assertions passed");
  process.exit(0);
}
console.error("check-tool-references.test.mjs: failures:");
for (const f of failures) console.error("  -", f);
process.exit(1);
