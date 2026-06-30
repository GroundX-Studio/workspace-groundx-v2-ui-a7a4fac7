import { describe, expect, it } from "vitest";

import { schemaFieldExtractionResultSchema, type SchemaFieldExtractionResult } from "@groundx/shared";

/**
 * 2026-05-31-session-auth-subshapes Task 2 — `SchemaFieldExtractionResult` is a
 * discriminated union on `status`. The success-only fields
 * (`value`/`confidence`/`previousConfidence`/`citation`) live ONLY on the
 * `"done"` arm; a `"pending"` or `"error"` result cannot carry them.
 *
 * The `@ts-expect-error` asserts are load-bearing under `npm run build` (tsc):
 * reverting to the flat record makes the illegal shapes assignable → the
 * directives stop firing → build RED.
 */

// pending arm: no value/confidence/citation
const _pending: SchemaFieldExtractionResult = { status: "pending" };
// done arm: value required, optional confidence/previousConfidence/citation
const _done: SchemaFieldExtractionResult = {
  status: "done",
  value: 142.3,
  confidence: 0.91,
  previousConfidence: 0.8,
  citation: { documentId: "doc-1", page: 1, snippet: "Total $142.30" },
};
const _doneMinimal: SchemaFieldExtractionResult = { status: "done", value: null };
// error arm: optional message only
const _error: SchemaFieldExtractionResult = { status: "error" };
const _errorWithMsg: SchemaFieldExtractionResult = { status: "error", message: "timeout" };

// @ts-expect-error — `value` cannot ride a "pending" result
const _pendingWithValue: SchemaFieldExtractionResult = { status: "pending", value: 42 };
// @ts-expect-error — `confidence` cannot ride an "error" result
const _errorWithConfidence: SchemaFieldExtractionResult = { status: "error", confidence: 0.9 };
// @ts-expect-error — a "done" result must carry `value`
const _doneNoValue: SchemaFieldExtractionResult = { status: "done", confidence: 0.5 };

function read(r: SchemaFieldExtractionResult): string {
  switch (r.status) {
    case "pending":
      return "pending";
    case "done":
      return String(r.value);
    case "error":
      return r.message ?? "error";
  }
}

describe("SchemaFieldExtractionResult — discriminated union", () => {
  it("narrows on status to read success-only fields", () => {
    expect(read(_pending)).toBe("pending");
    expect(read(_done)).toBe("142.3");
    expect(read(_doneMinimal)).toBe("null");
    expect(read(_error)).toBe("error");
    expect(read(_errorWithMsg)).toBe("timeout");
  });

  it("keeps the type-level reject asserts referenced", () => {
    expect([_pendingWithValue, _errorWithConfidence, _doneNoValue]).toHaveLength(3);
  });

  it("Zod schema accepts each valid variant", () => {
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "pending" }).success).toBe(true);
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "done", value: null }).success).toBe(true);
    expect(
      schemaFieldExtractionResultSchema.safeParse({
        status: "done",
        value: 1,
        confidence: 0.5,
        previousConfidence: 0.4,
        citation: { documentId: "d", page: 2 },
      }).success,
    ).toBe(true);
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "error", message: "x" }).success).toBe(true);
  });

  it("Zod schema rejects success-only fields on a non-done arm", () => {
    // discriminatedUnion is strict per-variant: a confidence on the error arm
    // is an unknown key and fails (no value-space for it).
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "error", confidence: 0.9 }).success).toBe(false);
    expect(schemaFieldExtractionResultSchema.safeParse({ status: "queued" }).success).toBe(false);
  });
});
