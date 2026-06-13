import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * report-empty-state T2b — durable no-client-fixture guard.
 *
 * Root cause of the smart-report regressions: a client-side `reportFixtures`
 * module exported a scope→fixture-template ROUTING (`getReportFixture` /
 * `reportTemplateIdForScope`) that PRODUCTION widgets imported — putting
 * fabricated report data in front of users and routing the live render to a
 * fake template id. The locked no-seed decision (`project_prelaunch_correctness`)
 * forbids this. This guard FAILS if production client code reintroduces that
 * shape; real report content comes only from a DB-backed template via the live
 * render path.
 *
 * SCOPE — non-test source only. `src/test/**`, `*.test.*`, and `*.spec.*` are
 * EXEMPT: the `makeFakeApi` render double is legitimate test infra (test-doubles
 * are NOT "mock mode"), and tests legitimately build `RenderedReport` literals.
 * The guard targets a scope→fixture-template MAP / a `reportFixtures` import —
 * NOT any `RenderedReport` literal (`report-default-template` extends the
 * `makeFakeApi` double with a seeded-section literal, which must NOT trip this).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

const FORBIDDEN = [
  /from\s+["'][^"']*reportFixtures["']/, // import of a client reportFixtures module
  /\bgetReportFixture\s*\(/, // scope → fabricated RenderedReport read
  /\breportTemplateIdForScope\s*\(/, // scope → fixture template-id routing
];

function isExempt(rel: string): boolean {
  return rel.startsWith("test/") || /\.(test|spec)\.[tj]sx?$/.test(rel);
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(abs);
    } else if (/\.[tj]sx?$/.test(entry.name)) {
      yield abs;
    }
  }
}

/** True when `source` reintroduces the forbidden client-fixture shape. */
function reintroducesFixture(source: string): boolean {
  return FORBIDDEN.some((re) => re.test(source));
}

describe("no client-side report fixture (report-empty-state T2b)", () => {
  it("no PRODUCTION module reintroduces a scope→fixture report-template map / reportFixtures import", () => {
    const offenders: string[] = [];
    for (const abs of walk(SRC)) {
      const rel = relative(SRC, abs);
      if (isExempt(rel)) continue;
      if (reintroducesFixture(readFileSync(abs, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  // Proves the guard is not a no-op: it FLAGS the reintroduction shape, and does
  // NOT flag a legitimate `RenderedReport` literal (what the makeFakeApi test
  // double + report-default-template build).
  it("flags a reintroduced fixture import / scope→template routing, not a plain RenderedReport literal", () => {
    expect(reintroducesFixture(`import { getReportFixture } from "@/widgets/reportFixtures";`)).toBe(true);
    expect(reintroducesFixture(`const id = reportTemplateIdForScope(scope);`)).toBe(true);
    expect(
      reintroducesFixture(`const r: RenderedReport = { reportId: "x", templateId: "y", sections: [] };`),
    ).toBe(false);
  });
});
