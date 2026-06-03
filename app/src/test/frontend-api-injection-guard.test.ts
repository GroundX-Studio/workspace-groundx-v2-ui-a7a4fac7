import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

const MIGRATED_NETWORK_BOUNDARIES = [
  "@/api/chatSessionEntities",
  "@/api/chatSessionPatch",
  "@/api/chatSessions",
  "@/api/chatSessionsList",
  "@/api/claimAnonymousChat",
  "@/api/entities/onboardingSessionEntity",
  "@/api/viewerEvents",
] as const;

const PRODUCTION_ALLOWLIST = new Set([
  // Composition root for the injected real client.
  "api/client.ts",
  // Legacy aggregate remains available until the final cleanup phase.
  "api/index.ts",
  // The migrated network modules may import each other internally.
  "api/chatSessionEntities.ts",
  "api/chatSessionPatch.ts",
  "api/chatSessions.ts",
  "api/chatSessionsList.ts",
  "api/claimAnonymousChat.ts",
  "api/entities/onboardingSessionEntity.ts",
  "api/viewerEvents.ts",
]);

const TEST_MOCK_ALLOWLIST = new Set([
  // Tests the real client wrapper by mocking the underlying establish transport.
  "api/client.test.ts",
]);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...listTsFiles(abs));
      continue;
    }
    if (/\.tsx?$/.test(entry)) out.push(abs);
  }
  return out;
}

const toRel = (file: string) => relative(SRC, file).replace(/\\/g, "/");

const isTestFile = (rel: string) => /\.test\.tsx?$/.test(rel);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findDirectBoundaryImports(rel: string, src: string): string[] {
  const stripped = stripComments(src);
  const offenders: string[] = [];
  const boundarySet = new Set<string>(MIGRATED_NETWORK_BOUNDARIES);
  const importFrom = /\bimport\s+([^;]*?)\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importFrom.exec(stripped)) !== null) {
    const specifier = match[1]?.trim() ?? "";
    const source = match[2] ?? "";
    if (!boundarySet.has(source)) continue;
    if (specifier.startsWith("type ")) continue;
    offenders.push(`${rel} imports ${source}`);
  }
  for (const boundary of MIGRATED_NETWORK_BOUNDARIES) {
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sideEffectImport = new RegExp(`\\bimport\\s+["']${escaped}["']`, "m");
    if (sideEffectImport.test(stripped)) offenders.push(`${rel} imports ${boundary}`);
  }
  return offenders;
}

function findBoundaryMocks(rel: string, src: string): string[] {
  const stripped = stripComments(src);
  const offenders: string[] = [];
  for (const boundary of MIGRATED_NETWORK_BOUNDARIES) {
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mockCall = new RegExp(`\\bvi\\.mock\\(\\s*["']${escaped}["']`, "m");
    if (mockCall.test(stripped)) offenders.push(`${rel} mocks ${boundary}`);
  }
  return offenders;
}

describe("frontend API injection guard", () => {
  const files = listTsFiles(SRC);

  it("keeps migrated production consumers on useApi instead of direct network imports", () => {
    const offenders = files.flatMap((file) => {
      const rel = toRel(file);
      if (isTestFile(rel)) return [];
      if (rel.startsWith("api/") && !PRODUCTION_ALLOWLIST.has(rel)) return [];
      if (PRODUCTION_ALLOWLIST.has(rel)) return [];
      return findDirectBoundaryImports(rel, readFileSync(file, "utf8"));
    });

    expect(
      offenders,
      `Migrated frontend consumers must use useApi()/ApiProvider for session-chat network calls:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps tests from reintroducing per-file mocks for migrated network boundaries", () => {
    const offenders = files.flatMap((file) => {
      const rel = toRel(file);
      if (!isTestFile(rel)) return [];
      if (TEST_MOCK_ALLOWLIST.has(rel)) return [];
      return findBoundaryMocks(rel, readFileSync(file, "utf8"));
    });

    expect(
      offenders,
      `Use makeFakeApi/render harness overrides instead of vi.mock on migrated boundaries:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
