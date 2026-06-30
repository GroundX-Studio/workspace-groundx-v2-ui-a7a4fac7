/**
 * Drift guard — the runtime has NO mock/dev-client mode
 * (2026-06-01-retire-mock-mode, durable `app-architecture` requirement).
 *
 * The product removed `MOCK_MODE` entirely: there is no env flag that swaps the
 * real `Fetch*` clients for `Dev*` stand-ins, no canned chat responses
 * (`chatMocks`), no stubbed extract values, and no in-code report fixture branch
 * at runtime. The ONLY substitute permitted is a fake INJECTED at the dependency
 * seam by a test (which is the legitimate test-double seam, NOT "mock mode").
 *
 * This guard walks the middleware NON-TEST source tree and fails if any of the
 * mock-mode tokens reappears in runtime code:
 *   - `MOCK_MODE`            — the retired env flag
 *   - `useDevClients`        — the retired boot selector
 *   - `DevGroundXClient` / `DevGroundXPartnerClient` / `DevLlmClient` — dev clients
 *   - `chatMocks`            — the canned chat-response module
 *   - a `mockMode` deps field — the per-service runtime branch flag
 *
 * `*.test.ts` files and `*.fixture.*` files are intentionally excluded — a test
 * MAY name a fake/fixture, and a re-grounded test references the live path, not
 * a mock-mode flag. The guard targets RUNTIME source only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_SRC = resolve(HERE, ".."); // middleware/src

function listRuntimeSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...listRuntimeSourceFiles(abs));
      continue;
    }
    if (!/\.ts$/.test(entry)) continue;
    if (/\.test\.ts$/.test(entry)) continue; // production source only
    if (/\.fixture\./.test(entry)) continue; // injected test fixtures, not runtime
    out.push(abs);
  }
  return out;
}

// The forbidden tokens + a human label. Each is a literal substring (not a
// loose regex) so the guard catches the exact reintroduction.
const FORBIDDEN: Array<{ token: string; label: string }> = [
  { token: "MOCK_MODE", label: "the retired MOCK_MODE env flag" },
  { token: "useDevClients", label: "the retired useDevClients boot selector" },
  { token: "DevGroundXClient", label: "the retired DevGroundXClient dev client" },
  { token: "DevGroundXPartnerClient", label: "the retired DevGroundXPartnerClient dev client" },
  { token: "DevLlmClient", label: "the retired DevLlmClient dev client" },
  { token: "chatMocks", label: "the retired chatMocks canned-response module" },
];

// A `mockMode` deps field — `mockMode:` in a type/object literal. Matched
// separately because the bare word `mock` is too broad (legit test doubles use
// `vi.mock`, `mockResolvedValue`, etc. — but those live in *.test.ts, excluded).
const MOCK_MODE_DEPS_FIELD = /\bmockMode\b/;

describe("drift guard — no mock/dev-client mode in middleware runtime", () => {
  const files = listRuntimeSourceFiles(REPO_SRC);

  it("walks a non-empty set of runtime source files (guard is non-vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no runtime file references a retired mock-mode token", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = file.slice(REPO_SRC.length + 1);
      for (const { token, label } of FORBIDDEN) {
        if (src.includes(token)) {
          offenders.push(`${rel} › references ${token} (${label})`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no runtime file declares or passes a mockMode deps field", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = file.slice(REPO_SRC.length + 1);
      if (MOCK_MODE_DEPS_FIELD.test(src)) {
        offenders.push(`${rel} › declares/passes a mockMode deps field`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("config/env defines no MOCK_MODE schema field", () => {
    const envSrc = readFileSync(join(REPO_SRC, "config", "env.ts"), "utf8");
    expect(envSrc).not.toMatch(/MOCK_MODE/);
  });
});
