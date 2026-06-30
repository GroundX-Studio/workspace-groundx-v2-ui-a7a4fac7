import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * OB-08 closure guard. The migration replaced every production
 * `console.error(...)` call with `captureException(...)` via the
 * Sentry wrapper. This test prevents the inverse drift: if a
 * future PR adds a fresh `console.error` to a production file, this
 * test fails before merge.
 *
 * Allowed exceptions:
 *   - Test files (`*.test.ts`, `*.test.tsx`).
 *   - The shared `src/test/` setup harness.
 *   - `src/lib/sentry.ts` itself, which mentions `console.error`
 *     in its block comment as an explanation.
 */

const APP_SRC_ROOT = join(__dirname, "..");

function isExempt(relativePath: string): boolean {
  if (relativePath.includes(".test.")) return true;
  if (relativePath.startsWith("test/")) return true;
  if (relativePath === "lib/sentry.ts") return true;
  return false;
}

function* walk(dir: string, root: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
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

describe("OB-08 sentry-migration drift guard", () => {
  it("zero production files in app/src contain `console.error`", () => {
    const offenders: Array<{ file: string; line: number; preview: string }> = [];
    for (const rel of walk(APP_SRC_ROOT, APP_SRC_ROOT)) {
      if (isExempt(rel)) continue;
      const contents = readFileSync(join(APP_SRC_ROOT, rel), "utf8");
      if (!contents.includes("console.error")) continue;
      contents.split("\n").forEach((line, idx) => {
        if (line.includes("console.error")) {
          offenders.push({ file: rel, line: idx + 1, preview: line.trim().slice(0, 120) });
        }
      });
    }
    if (offenders.length > 0) {
      const formatted = offenders.map((o) => `  ${o.file}:${o.line}  ${o.preview}`).join("\n");
      throw new Error(
        `console.error found in production files (OB-08 drift). Use \`captureException\` from \`@/lib/sentry\` instead:\n${formatted}`,
      );
    }
    expect(offenders).toHaveLength(0);
  });
});
