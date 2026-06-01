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

// Test 4 — 2026-05-31-tool-system-completion glob-home (BROAD): a
// `*.tools.ts` co-located with a VIEW (views/**) and a PRIMITIVE
// (components/primitives/**) is discovered by `collectKnownToolNames`,
// so a `tool="..."` reference to a view/primitive-hosted tool resolves
// instead of failing as "unknown". Proves the reference walker learned
// the same homes as the registry + quality scanner (no drift).
{
  // View-hosted tool home.
  const viewToolDir = resolve(APP_ROOT, "src/views/__GlobHomeFixtureView__");
  const viewToolFile = join(viewToolDir, "GlobHomeFixtureView.tools.ts");
  const viewRefFile = join(viewToolDir, "GlobHomeFixtureView.tsx");
  // Primitive-hosted tool home.
  const primToolDir = resolve(APP_ROOT, "src/components/primitives/GlobHomeFixturePrimitive");
  const primToolFile = join(primToolDir, "GlobHomeFixturePrimitive.tools.ts");
  const primRefFile = join(primToolDir, "GlobHomeFixturePrimitive.tsx");
  mkdirSync(viewToolDir, { recursive: true });
  mkdirSync(primToolDir, { recursive: true });
  writeFileSync(
    viewToolFile,
    `import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "wizard_glob_home_fixture",
  description: "Glob-home fixture view tool. Use when the reference walker checks view homes.",
  category: "read",
  input: z.object({ id: z.string().describe("identifier") }),
  handler: () => null,
};
export const tools = [t];
`,
  );
  writeFileSync(
    viewRefFile,
    `import { Button } from "@/components/primitives/Button/Button";
export const ViewProbe = () => <Button tool="wizard_glob_home_fixture">probe</Button>;
`,
  );
  writeFileSync(
    primToolFile,
    `import { z } from "zod";
import type { WidgetTool } from "@/tools/types";
const t: WidgetTool = {
  name: "close_glob_home_fixture",
  description: "Glob-home fixture primitive tool. Use when the reference walker checks primitive homes.",
  category: "read",
  input: z.object({ id: z.string().describe("identifier") }),
  handler: () => null,
};
export const tools = [t];
`,
  );
  writeFileSync(
    primRefFile,
    `import { Button } from "@/components/primitives/Button/Button";
export const PrimProbe = () => <Button tool="close_glob_home_fixture">probe</Button>;
`,
  );
  try {
    const r = runScript();
    assert(
      r.code === 0,
      `expected view/primitive-hosted tool references to resolve, got code=${r.code}, stderr=${r.stderr}`,
    );
  } finally {
    rmSync(viewToolDir, { recursive: true, force: true });
    rmSync(primToolDir, { recursive: true, force: true });
  }
}

// Test 5 — 2026-05-28-wf04-tool-coverage-completion §6: the binding guard
// covers every interactive surface, not just Button/IconButton/TextField. A
// `GxPill` with an `onClick` and no `tool`/`noTool` MUST fail; a `DropdownMenu`
// (its items are inherently interactive) with no `tool`/`noTool` MUST fail; a
// `GxSectionHeader` with an `onClick` and no binding MUST fail. The same
// surfaces WITH a binding (real tool or honest noTool) MUST pass.
{
  const unboundFile = resolve(APP_ROOT, "src/views/Onboarding/__check_unbound_fixture__.tsx");

  // 5a — GxPill with onClick, no binding → fail, named.
  writeFileSync(
    unboundFile,
    `import { GxPill } from "@/components/brand/GxPill/GxPill";
export const Probe = () => <GxPill onClick={() => {}}>x</GxPill>;
`,
  );
  try {
    const r = runScript();
    assert(r.code === 1, `expected unbound GxPill(onClick) to fail, got code=${r.code}`);
    assert(
      r.stderr.includes("GxPill"),
      `expected stderr to name the unbound GxPill, got: ${r.stderr}`,
    );
  } finally {
    rmSync(unboundFile, { force: true });
  }

  // 5b — GxPill WITHOUT onClick (decorative) → passes, even with no binding.
  writeFileSync(
    unboundFile,
    `import { GxPill } from "@/components/brand/GxPill/GxPill";
export const Probe = () => <GxPill variant="success">done</GxPill>;
`,
  );
  try {
    const r = runScript();
    assert(r.code === 0, `expected decorative GxPill (no onClick) to pass, got code=${r.code}, stderr=${r.stderr}`);
  } finally {
    rmSync(unboundFile, { force: true });
  }

  // 5c — GxPill with onClick AND an honest noTool → passes.
  writeFileSync(
    unboundFile,
    `import { GxPill } from "@/components/brand/GxPill/GxPill";
export const Probe = () => <GxPill onClick={() => {}} noTool="decorative status toggle">x</GxPill>;
`,
  );
  try {
    const r = runScript();
    assert(r.code === 0, `expected bound GxPill(onClick) to pass, got code=${r.code}, stderr=${r.stderr}`);
  } finally {
    rmSync(unboundFile, { force: true });
  }

  // 5d — DropdownMenu with no binding → fail (its items are inherently interactive).
  writeFileSync(
    unboundFile,
    `import { DropdownMenu } from "@/components/primitives/DropdownMenu/DropdownMenu";
export const Probe = () => <DropdownMenu trigger={() => null} items={[]} />;
`,
  );
  try {
    const r = runScript();
    assert(r.code === 1, `expected unbound DropdownMenu to fail, got code=${r.code}`);
    assert(
      r.stderr.includes("DropdownMenu"),
      `expected stderr to name the unbound DropdownMenu, got: ${r.stderr}`,
    );
  } finally {
    rmSync(unboundFile, { force: true });
  }

  // 5e — DropdownMenu WITH an honest noTool → passes.
  writeFileSync(
    unboundFile,
    `import { DropdownMenu } from "@/components/primitives/DropdownMenu/DropdownMenu";
export const Probe = () => <DropdownMenu noTool="row-local actions, dispatched by host" trigger={() => null} items={[]} />;
`,
  );
  try {
    const r = runScript();
    assert(r.code === 0, `expected bound DropdownMenu to pass, got code=${r.code}, stderr=${r.stderr}`);
  } finally {
    rmSync(unboundFile, { force: true });
  }

  // 5f — GxSectionHeader with onClick, no binding → fail.
  writeFileSync(
    unboundFile,
    `import { GxSectionHeader } from "@/components/brand/GxSectionHeader/GxSectionHeader";
export const Probe = () => <GxSectionHeader label="X" onClick={() => {}} />;
`,
  );
  try {
    const r = runScript();
    assert(r.code === 1, `expected unbound GxSectionHeader(onClick) to fail, got code=${r.code}`);
    assert(
      r.stderr.includes("GxSectionHeader"),
      `expected stderr to name the unbound GxSectionHeader, got: ${r.stderr}`,
    );
  } finally {
    rmSync(unboundFile, { force: true });
  }
}

if (failures.length === 0) {
  console.log("check-tool-references.test.mjs: all assertions passed");
  process.exit(0);
}
console.error("check-tool-references.test.mjs: failures:");
for (const f of failures) console.error("  -", f);
process.exit(1);
