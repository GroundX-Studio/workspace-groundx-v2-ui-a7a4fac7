import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

function* walkToolFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) yield* walkToolFiles(abs);
    if (stat.isFile() && entry.endsWith(".tools.ts")) yield abs;
  }
}

describe("app tool declarations", () => {
  it("do not carry dead app-side runtime handlers", () => {
    const offenders: string[] = [];
    for (const file of walkToolFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      if (/\bhandler\s*:/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("does not expose a production toolRegistry singleton", () => {
    expect(() => readFileSync(resolve(SRC, "tools", "registry.ts"), "utf8")).toThrow();
  });
});
