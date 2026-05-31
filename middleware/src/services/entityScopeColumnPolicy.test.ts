import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// 2026-05-31-steady-scope-producer Phase 3 — entity-rag §9 "no read-only
// scope column" drift guard.
//
// Policy: every `chat_session_entities` scope column READ by
// `deriveRagContentScope` MUST either
//   (a) have a real non-test PRODUCER (a writer that assigns a non-null
//       value), OR
//   (b) be explicitly KEPT for a TRACKED future consumer (cf19's
//       multi-bucket→group substrate; the single-doc-viewer / wf05b
//       documentIds substrate).
// A column with neither is a read-only dead column and must be dropped
// (column + read site + record field) — this guard goes RED if one
// appears, OR if the declared policy stops matching the columns the
// reader actually reads.
//
// The conservative §9 outcome of this change: NO column is dropped —
// bucketId + projectIdsJson get the `sample` producer; groupId +
// documentIdsJson are kept for their tracked future consumers. Over-
// dropping groupId / documentIdsJson would break cf19's eventual rework
// and the single-doc viewer flows, so they are KEPT here.

const here = dirname(fileURLToPath(import.meta.url));

type ColumnPolicy =
  | { column: string; producer: string }
  | { column: string; keptFor: string };

const SCOPE_COLUMN_POLICY: ColumnPolicy[] = [
  // Producer-backed (this change). The `sample` producer writes a real
  // non-null value into these.
  { column: "bucketId", producer: "entityScopeProducer.produceEntityScope" },
  { column: "projectIdsJson", producer: "entityScopeProducer.produceEntityScope" },
  // No producer yet — KEPT for tracked future consumers, NOT dropped.
  { column: "groupId", keptFor: "cf19 multi-bucket→group substrate (backlogged, tracked)" },
  { column: "documentIdsJson", keptFor: "single-doc viewer / wf05b substrate (tracked)" },
];

function readSource(relPath: string): string {
  return readFileSync(resolve(here, relPath), "utf8");
}

/**
 * The set of scope columns `deriveRagContentScope` actually reads off the
 * entity record. Parsed from the reader source so the guard tracks the
 * real read site, not a hand-maintained copy.
 */
function columnsReadByDeriveRagContentScope(): Set<string> {
  const src = readSource("./chatHandler.ts");
  // Isolate the deriveRagContentScope function body.
  const start = src.indexOf("export function deriveRagContentScope");
  expect(start).toBeGreaterThanOrEqual(0);
  // The function ends at the next top-level `export class`/`function` —
  // ChatHandlerError follows it. Slice to there.
  const end = src.indexOf("export class ChatHandlerError", start);
  expect(end).toBeGreaterThan(start);
  const body = src.slice(start, end);
  const candidates = ["bucketId", "projectIdsJson", "groupId", "documentIdsJson"];
  const read = new Set<string>();
  for (const col of candidates) {
    // The reader dereferences `activeEntity.<col>`.
    if (body.includes(`activeEntity.${col}`)) {
      read.add(col);
    }
  }
  return read;
}

describe("entity-rag §9 — every read scope column has a producer or a tracked-keep reason", () => {
  it("the policy table covers exactly the columns deriveRagContentScope reads", () => {
    const read = columnsReadByDeriveRagContentScope();
    const declared = new Set(SCOPE_COLUMN_POLICY.map((p) => p.column));
    // Every read column must be declared (else it could be a read-only
    // dead column the policy doesn't account for).
    for (const col of read) {
      expect(declared.has(col)).toBe(true);
    }
    // And the policy must not declare a column the reader no longer reads
    // (a stale keep / phantom producer).
    for (const col of declared) {
      expect(read.has(col)).toBe(true);
    }
  });

  it("a producer-backed column actually has a non-null assignment in its named producer", () => {
    const producerSrc = readSource("./entityScopeProducer.ts");
    for (const entry of SCOPE_COLUMN_POLICY) {
      if (!("producer" in entry)) continue;
      // Proof the producer writes a NON-NULL value into the column (not a
      // structural `col: null`). e.g. `bucketId: samplesBucketId,` /
      // `projectIdsJson: JSON.stringify(...)`.
      const nullAssign = new RegExp(`${entry.column}\\s*:\\s*null`);
      const anyAssign = new RegExp(`${entry.column}\\s*:\\s*[^,\\n]+`);
      const hasNonNull = producerSrc
        .split("\n")
        .some((line) => anyAssign.test(line) && !nullAssign.test(line));
      expect(hasNonNull, `${entry.column} must have a non-null producer assignment`).toBe(true);
    }
  });

  it("a kept-but-producerless column is documented with a tracked consumer (no silent read-only column)", () => {
    for (const entry of SCOPE_COLUMN_POLICY) {
      if (!("keptFor" in entry)) continue;
      expect(entry.keptFor.length, `${entry.column} kept-for reason must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("no scope column is left read-only: each read column is producer-backed OR kept-for-tracked-consumer", () => {
    const read = columnsReadByDeriveRagContentScope();
    for (const col of read) {
      const entry = SCOPE_COLUMN_POLICY.find((p) => p.column === col);
      expect(entry, `${col} is read but has no policy entry`).toBeDefined();
      const justified = entry != null && ("producer" in entry || "keptFor" in entry);
      expect(justified, `${col} is read-only (no producer, no tracked-keep) — drop it`).toBe(true);
    }
  });
});
