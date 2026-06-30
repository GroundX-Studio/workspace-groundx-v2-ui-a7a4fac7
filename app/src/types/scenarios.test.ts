import { describe, expect, it } from "vitest";

import type { ExtractedFieldValue as SharedExtractedFieldValue } from "@groundx/shared";

import type { ExtractedFieldValue } from "./scenarios";

/**
 * generated-result drift guard (Extract side) —
 * 2026-05-31-generated-result-shared.
 *
 * The app re-exports the shared `ExtractedFieldValue` (the Extract
 * specialization of the shared generated-result core) from `@/types/scenarios`.
 * This compile-time assert is load-bearing under `npm run build` (tsc): if the
 * app ever re-forks `ExtractedFieldValue` (renames `fieldId`, drops `citations`,
 * widens `confidence`, etc.) the bidirectional `Eq` evaluates `false` and
 * `Assert<false>` fails the build — a real drift guard, not a name-set check.
 * The `Eq<>` precedent is `app/src/api/chatSessions.test.ts:58`.
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type _assertExtract = Assert<Eq<ExtractedFieldValue, SharedExtractedFieldValue>>;

describe("ExtractedFieldValue drift guard (Extract side)", () => {
  it("the app re-export is pinned to the shared generated-result type at compile time", () => {
    // The `_assertExtract` type above is the real guard (tsc). This runtime
    // assertion documents the invariant the compile-time assert enforces.
    const v: ExtractedFieldValue = {
      fieldId: "amount_due",
      value: 18742.16,
      citations: [{ documentId: "d1", page: 1 }],
      confidence: 0.8,
      warnings: ["unit-ambiguous"],
    };
    const shared: SharedExtractedFieldValue = v;
    expect(shared.fieldId).toBe("amount_due");
  });
});
