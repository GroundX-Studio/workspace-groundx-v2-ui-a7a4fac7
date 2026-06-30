/**
 * Recurrence drift-guards (middleware half) — 2026-05-31-core-data-followups §5.
 *
 * Two guards that can only run against the MIDDLEWARE source tree (the app half
 * — guards a/b/c/d-app — lives in `app/src/test/recurrence-drift-guards.test.ts`):
 *
 *   (e) a persisted DB column with NO in-memory type field — the dead/write-only
 *       column smell. §4e dropped `chat_messages.tool_calls_json` /
 *       `attachments_json` precisely because they were written but never read
 *       back into an in-memory record. This guard fails if a persisted DATA
 *       column on a guarded table is not read into its row→object mapper (i.e.
 *       has no in-memory field). It is the structural complement of the
 *       round-trip rule (Discipline §9 / Rule 9).
 *
 *   (d) [middleware half] every middleware `*Error` class extends the shared
 *       `ApiError` base (§2). A hand-rolled `class XError extends Error`
 *       reintroduces the forked hierarchy this change removed.
 *
 * Authored AFTER the bases exist (§2 ApiError, §4c row-mapper validation, §4e
 * dead-column drop), so each guard is NON-vacuous: it walks the CURRENT tree and
 * would catch a real reintroduction (each was proven to fire by a temporary fork
 * during authoring, then reverted).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_SRC = resolve(HERE, ".."); // middleware/src

// ── Guard (e) — every persisted DATA column has an in-memory field ───────────
//
// A "guarded table" pairs a CREATE-TABLE block in `mysqlRepository.ts` with its
// row→object mapper function. The mapper reads `row.<column>` for every data
// column it surfaces into an in-memory record. A column present in the DDL but
// absent from the mapper is a write-only / dead column (§4e). STRUCTURAL columns
// (PRIMARY KEY housekeeping, FK targets, index-only / ON UPDATE bookkeeping) are
// declared as documented exemptions per table.
//
// `viewer_events` + `intent_log` are the chosen representatives: small, fully
// round-tripped (every data column → a `ViewerEventRecord` / `IntentLogRecord`
// field), and the precise shape §4e's drop normalized. Adding a write-only
// column to either — the exact regression §4e fixed — turns this RED.

interface GuardedTable {
  table: string;
  mapperFn: string;
  /** Columns NOT expected to round-trip into the mapper, each with a reason. */
  structuralExempt: Record<string, string>;
}

const GUARDED_TABLES: GuardedTable[] = [
  {
    table: "viewer_events",
    mapperFn: "rowToViewerEvent",
    structuralExempt: {
      // chat_session_id IS read (→ chatSessionId); no structural exemptions
      // needed for viewer_events — every data column round-trips.
    },
  },
  {
    table: "intent_log",
    mapperFn: "rowToIntentLog",
    structuralExempt: {
      // Same — every intent_log data column round-trips into IntentLogRecord.
    },
  },
  {
    table: "projects",
    mapperFn: "rowToProject",
    structuralExempt: {
      // Every projects data column round-trips into ProjectRecord.
    },
  },
  {
    table: "project_grants",
    mapperFn: "rowToProjectGrant",
    structuralExempt: {
      // Every grant data column round-trips into ProjectGrantRecord.
    },
  },
];

function readRepoSource(): string {
  return readFileSync(join(REPO_SRC, "db", "mysqlRepository.ts"), "utf8");
}

/**
 * Pull the column names declared in a `CREATE TABLE IF NOT EXISTS <table> ( ... )`
 * block. Skips clause lines (PRIMARY KEY / FOREIGN KEY / INDEX / UNIQUE /
 * CONSTRAINT) — those aren't data columns. Returns lower_snake column names.
 */
function columnsInCreateTable(src: string, table: string): string[] {
  const startMarker = `CREATE TABLE IF NOT EXISTS ${table} (`;
  const start = src.indexOf(startMarker);
  expect(start, `CREATE TABLE for ${table} not found`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf("(", start);
  // Balance parens to find the matching close (column defs can contain `(` in
  // types like VARCHAR(64)).
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open + 1, end);
  const cols: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    // Skip table-constraint clauses — not data columns.
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|INDEX|UNIQUE|CONSTRAINT|KEY)\b/i.test(line)) continue;
    // A column def starts with the column identifier.
    const m = /^([a-z_][a-z0-9_]*)\b/i.exec(line);
    if (m) cols.push(m[1]!.toLowerCase());
  }
  return cols;
}

/**
 * The body of the named row→object mapper function. Used to assert which
 * `row.<column>` reads it performs.
 */
function mapperBody(src: string, fnName: string): string {
  const marker = `function ${fnName}(`;
  const start = src.indexOf(marker);
  expect(start, `mapper ${fnName} not found`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return src.slice(open, end + 1);
}

describe("§5(e) — every persisted DATA column has an in-memory field (no dead/write-only column)", () => {
  const src = readRepoSource();

  for (const guarded of GUARDED_TABLES) {
    describe(`${guarded.table}`, () => {
      const cols = columnsInCreateTable(src, guarded.table);
      const body = mapperBody(src, guarded.mapperFn);

      it(`has enumerable columns + a ${guarded.mapperFn} mapper (sanity)`, () => {
        expect(cols.length).toBeGreaterThan(0);
        expect(body.length).toBeGreaterThan(0);
      });

      it(`every data column is read into ${guarded.mapperFn} (or is a documented structural exemption)`, () => {
        const orphans: string[] = [];
        for (const col of cols) {
          if (col in guarded.structuralExempt) continue;
          // The mapper reads `row.<col>` (directly or inside a coerceEnum / Number
          // wrapper) for every surfaced column.
          if (!body.includes(`row.${col}`)) {
            orphans.push(col);
          }
        }
        expect(
          orphans.length === 0,
          `${guarded.table}: persisted column(s) with no in-memory field (write-only / dead — ` +
            `read them into ${guarded.mapperFn} + the record type, or DROP the column per §4e / ` +
            `Discipline Rule 9): ${orphans.join(", ")}`,
        ).toBe(true);
      });

      it("every structural exemption still names a real column (sanity)", () => {
        const present = new Set(cols);
        const stale = Object.keys(guarded.structuralExempt).filter((c) => !present.has(c));
        expect(
          stale.length === 0,
          `${guarded.table}: structuralExempt has stale entries (column gone — delete them): ${stale.join(", ")}`,
        ).toBe(true);
      });
    });
  }
});

// ── Guard (d) [middleware half] — every middleware *Error extends ApiError ───

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...listSourceFiles(abs));
      continue;
    }
    if (!/\.ts$/.test(entry)) continue;
    if (/\.test\.ts$/.test(entry)) continue; // production source only
    out.push(abs);
  }
  return out;
}

describe("§5(d) — every middleware *Error class extends the shared ApiError", () => {
  const files = listSourceFiles(REPO_SRC);

  it("no middleware error class extends Error directly (must extend ApiError)", () => {
    const offenders: string[] = [];
    const re = /\bclass\s+([A-Za-z0-9_]*Error)\s+extends\s+Error\b/g;
    for (const file of files) {
      const fileSrc = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(fileSrc)) !== null) {
        offenders.push(`${file.slice(REPO_SRC.length + 1)} › class ${m[1]} extends Error`);
      }
    }
    expect(
      offenders.length === 0,
      `A middleware error class extends Error directly — extend the shared \`ApiError\` ` +
        `base (@groundx/shared) instead (§2):\n  ${offenders.join("\n  ")}`,
    ).toBe(true);
  });
});
