import { describe, expect, it } from "vitest";

import {
  schemaFieldExtractionResultSchema,
  type SchemaFieldExtractionResult as SharedSchemaFieldExtractionResult,
} from "@groundx/shared";

import type { SchemaFieldExtractionResult } from "./types";

/**
 * 2026-05-31-chat-wire-types-shared — `SchemaFieldExtractionResult` (the
 * per-field extraction result the chat propose-card fires for) was declared
 * only on the app (`ChatStoreContext/types.ts`) and consumed by
 * `ChatStoreContext.tsx` + `SchemaView.tsx`. It is now single-sourced on
 * `@groundx/shared` so any future middleware producer of the same shape shares
 * the one source.
 *
 * The `Eq<>` assert is load-bearing under `npm run build` (tsc): if the app
 * re-forks the shape, `Assert<false>` fails the build.
 */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertSchemaFieldExtractionResult = Assert<
  Eq<SchemaFieldExtractionResult, SharedSchemaFieldExtractionResult>
>;

describe("SchemaFieldExtractionResult — single source (@groundx/shared)", () => {
  it("validates a representative extraction-result fixture", () => {
    expect(
      schemaFieldExtractionResultSchema.safeParse({
        status: "done",
        value: 142.3,
        confidence: 0.91,
        previousConfidence: 0.8,
        citation: { documentId: "doc-1", page: 1, snippet: "Total $142.30" },
      }).success,
    ).toBe(true);
  });

  it("accepts the minimal pending shape (no value — success-only fields ride only the done arm)", () => {
    // 2026-05-31-session-auth-subshapes — `SchemaFieldExtractionResult` is now a
    // discriminated union; the `"pending"` arm carries NO `value`. A pending
    // result with a `value` is rejected (the illegal flat shape).
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "pending" }).success).toBe(true);
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "pending", value: null }).success).toBe(false);
  });

  it("rejects an out-of-union status", () => {
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "queued" }).success).toBe(false);
  });
});
