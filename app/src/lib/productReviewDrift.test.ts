import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * POL-04 drift guard. Per `project_scenario_fixtures.md`: draft copy
 * authored without product sign-off should be flagged with a
 * `// TODO: product-review` comment so it doesn't ship as final.
 * Closure rule: zero such markers in the production tree. This test
 * keeps it that way — any future PR that ships a `product-review`
 * tag fails CI before merge.
 *
 * Allowed exceptions:
 *   - Test files (`*.test.ts`, `*.test.tsx`).
 *   - The `src/test/` shared harness.
 *   - This file itself (drift-guard reference to the marker string).
 *   - `docs/` files outside `src/` (we only sweep production code).
 *
 * Scope: app + middleware source trees only. Docs / scaffolds in
 * other folders aren't included; they're authoring surfaces, not
 * shipped code.
 */

const APP_SRC_ROOT = join(__dirname, "..");
const MIDDLEWARE_SRC_ROOT = join(__dirname, "..", "..", "..", "middleware", "src");

// Pattern: `// TODO: product-review` plus a few tolerant variants
// (extra spaces, hyphen vs. underscore, optional bullet). The grep
// is strict enough to catch real reviewer flags without flagging
// unrelated comments that happen to mention product reviews in prose.
const PRODUCT_REVIEW_RE = /\/\/\s*TODO\s*:?\s*product[-_]review/i;

function isExempt(relativePath: string): boolean {
  if (relativePath.includes(".test.")) return true;
  if (relativePath.startsWith("test/") || relativePath.startsWith("../middleware/src/test/")) return true;
  // This file itself uses the marker string as part of the assertion.
  if (relativePath === "lib/productReviewDrift.test.ts") return true;
  return false;
}

function* walk(dir: string, root: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      yield* walk(fullPath, root);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const relative = fullPath.slice(root.length + 1);
    yield relative;
  }
}

function scan(root: string, labelPrefix: string): Array<{ file: string; line: number; preview: string }> {
  const offenders: Array<{ file: string; line: number; preview: string }> = [];
  for (const rel of walk(root, root)) {
    const exemptKey = labelPrefix ? `../${labelPrefix}/${rel}` : rel;
    if (isExempt(exemptKey) || isExempt(rel)) continue;
    const contents = readFileSync(join(root, rel), "utf8");
    if (!PRODUCT_REVIEW_RE.test(contents)) continue;
    contents.split("\n").forEach((line, idx) => {
      if (PRODUCT_REVIEW_RE.test(line)) {
        offenders.push({
          file: `${labelPrefix ? `${labelPrefix}/` : ""}${rel}`,
          line: idx + 1,
          preview: line.trim().slice(0, 120),
        });
      }
    });
  }
  return offenders;
}

describe("POL-04 product-review drift guard", () => {
  it("zero production files in app/src OR middleware/src carry an open product-review marker", () => {
    const offenders = [
      ...scan(APP_SRC_ROOT, "app/src"),
      ...scan(MIDDLEWARE_SRC_ROOT, "middleware/src"),
    ];
    if (offenders.length > 0) {
      const formatted = offenders.map((o) => `  ${o.file}:${o.line}  ${o.preview}`).join("\n");
      throw new Error(
        `Found unresolved product-review markers (POL-04 drift). Close each with either a real-copy swap or a product sign-off:\n${formatted}`,
      );
    }
    expect(offenders).toHaveLength(0);
  });
});
