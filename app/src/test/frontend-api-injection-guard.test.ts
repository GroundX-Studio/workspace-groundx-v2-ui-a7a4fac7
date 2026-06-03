import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

const MIGRATED_BOUNDARIES = [
  { domain: "legacy-aggregate", module: "@/api" },
  { domain: "auth", module: "@/api/entities/customerEntity" },
  { domain: "session-chat", module: "@/api/chatSessionEntities" },
  { domain: "session-chat", module: "@/api/chatSessionPatch" },
  { domain: "session-chat", module: "@/api/chatSessions" },
  { domain: "session-chat", module: "@/api/chatSessionsList" },
  { domain: "session-chat", module: "@/api/claimAnonymousChat" },
  { domain: "session-chat", module: "@/api/entities/onboardingSessionEntity" },
  { domain: "session-chat", module: "@/api/viewerEvents" },
  { domain: "resources", module: "@/api/entities/groundxApiKeysEntity" },
  { domain: "resources", module: "@/api/entities/groundxBucketsEntity" },
  { domain: "resources", module: "@/api/entities/groundxCustomerEntity" },
  { domain: "resources", module: "@/api/entities/groundxDocumentsEntity" },
  { domain: "resources", module: "@/api/entities/groundxGroupsEntity" },
  { domain: "resources", module: "@/api/entities/groundxHealthEntity" },
  { domain: "resources", module: "@/api/entities/groundxSearchEntity" },
  { domain: "resources", module: "@/api/entities/groundxWorkflowsEntity" },
  { domain: "resources", module: "@/api/entities/partnerApiKeysEntity" },
  { domain: "resources", module: "@/api/entities/partnerBucketsEntity" },
  { domain: "resources", module: "@/api/entities/partnerCustomerEntity" },
  { domain: "resources", module: "@/api/entities/partnerGroupsEntity" },
  { domain: "resources", module: "@/api/entities/partnerProjectsEntity" },
  { domain: "scenario-canvas", module: "@/api/entities/scenarioRegistryEntity" },
  { domain: "scenario-canvas", module: "@/api/intentLog" },
  { domain: "extract", module: "@/api/extractField" },
  { domain: "extract", module: "@/api/fieldGeometry" },
  { domain: "extract", module: "@/api/templates" },
  { domain: "extract", module: "@/api/useLiveExtract" },
  { domain: "extract", module: "@/api/useLiveExtractionSchema" },
  { domain: "smart-report", module: "@/api/smartReport" },
  { domain: "telemetry", module: "@/lib/sentry" },
] as const;

type Boundary = (typeof MIGRATED_BOUNDARIES)[number];

interface Offender {
  boundary: string;
  domain: string;
  file: string;
  kind: "import" | "mock";
}

const PRODUCTION_PREFIX_ALLOWLIST = [
  "api/",
] as const;

const PRODUCTION_FILE_ALLOWLIST = new Set([
  // Sentry boot only; rendered runtime capture flows through Api.telemetry.
  "main.tsx",
]);

const TEST_FILE_MOCK_ALLOWLIST = new Set([
  // Tests the real Api composition root by substituting a lower-level module.
  "api/client.test.ts",
]);

const TEST_PREFIX_MOCK_ALLOWLIST = [
  // API implementation tests may mock the Sentry wrapper they are directly
  // asserting. Rendered runtime tests must use Api.telemetry instead.
  "api/",
] as const;

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isProductionImportAllowed(rel: string): boolean {
  if (PRODUCTION_FILE_ALLOWLIST.has(rel)) return true;
  return PRODUCTION_PREFIX_ALLOWLIST.some((prefix) => rel.startsWith(prefix));
}

function isTestMockAllowed(rel: string, boundary: Boundary): boolean {
  if (TEST_FILE_MOCK_ALLOWLIST.has(rel)) return true;
  if (boundary.module === "@/lib/sentry") {
    return TEST_PREFIX_MOCK_ALLOWLIST.some((prefix) => rel.startsWith(prefix));
  }
  return false;
}

function findDirectBoundaryImports(rel: string, src: string): Offender[] {
  if (isProductionImportAllowed(rel)) return [];
  const stripped = stripComments(src);
  const offenders: Offender[] = [];
  const importFrom = /\bimport\s+([^;]*?)\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importFrom.exec(stripped)) !== null) {
    const specifier = match[1]?.trim() ?? "";
    const source = match[2] ?? "";
    const boundary = MIGRATED_BOUNDARIES.find((candidate) => candidate.module === source);
    if (!boundary) continue;
    if (specifier.startsWith("type ")) continue;
    offenders.push({ boundary: source, domain: boundary.domain, file: rel, kind: "import" });
  }
  for (const boundary of MIGRATED_BOUNDARIES) {
    const sideEffectImport = new RegExp(`\\bimport\\s+["']${escapeRegex(boundary.module)}["']`, "m");
    if (sideEffectImport.test(stripped)) {
      offenders.push({ boundary: boundary.module, domain: boundary.domain, file: rel, kind: "import" });
    }
  }
  return offenders;
}

function findBoundaryMocks(rel: string, src: string): Offender[] {
  const stripped = stripComments(src);
  const offenders: Offender[] = [];
  for (const boundary of MIGRATED_BOUNDARIES) {
    if (isTestMockAllowed(rel, boundary)) continue;
    const mockCall = new RegExp(`\\bvi\\.mock\\(\\s*["']${escapeRegex(boundary.module)}["']`, "m");
    if (mockCall.test(stripped)) {
      offenders.push({ boundary: boundary.module, domain: boundary.domain, file: rel, kind: "mock" });
    }
  }
  return offenders;
}

function formatOffenders(offenders: Offender[]): string {
  const grouped = new Map<string, Offender[]>();
  for (const offender of offenders) {
    const group = grouped.get(offender.domain) ?? [];
    group.push(offender);
    grouped.set(offender.domain, group);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, items]) => {
      const lines = items
        .sort((a, b) => `${a.file}:${a.boundary}`.localeCompare(`${b.file}:${b.boundary}`))
        .map((item) => `  - ${item.file} ${item.kind}s ${item.boundary}`);
      return `[${domain}]\n${lines.join("\n")}`;
    })
    .join("\n");
}

describe("frontend API injection guard", () => {
  const files = listTsFiles(SRC);

  it("keeps migrated production consumers on useApi instead of direct network imports", () => {
    const offenders = files.flatMap((file) => {
      const rel = toRel(file);
      if (isTestFile(rel)) return [];
      return findDirectBoundaryImports(rel, readFileSync(file, "utf8"));
    });

    expect(
      offenders,
      `Migrated frontend consumers must use useApi()/ApiProvider for network and telemetry calls:\n${formatOffenders(offenders)}`,
    ).toEqual([]);
  });

  it("keeps tests from reintroducing per-file mocks for migrated network and telemetry boundaries", () => {
    const offenders = files.flatMap((file) => {
      const rel = toRel(file);
      if (!isTestFile(rel)) return [];
      return findBoundaryMocks(rel, readFileSync(file, "utf8"));
    });

    expect(
      offenders,
      `Use makeFakeApi/render harness overrides instead of vi.mock on migrated boundaries:\n${formatOffenders(offenders)}`,
    ).toEqual([]);
  });
});
