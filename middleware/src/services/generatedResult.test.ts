import { describe, expect, it } from "vitest";

import {
  extractedFieldValueSchema,
  generatedResultSchema,
  parseGeneratedResult,
  type ExtractedFieldValue,
  type GeneratedResult,
  type RenderedSection,
  renderedSectionSchema,
} from "@groundx/shared";

/**
 * Shared "generated result" shape (core-data-model-hardening item 2). ONE
 * shape underlies both the Extract field value and the Report rendered
 * section — the Result half of Template + Scope + Results. A generated result
 * is a generated **body** + `citations[]` + optional `confidence` + optional
 * `warnings[]`. Extract specializes it with a `fieldId` and a scalar field
 * value as the body; Report specializes it with a `sectionId` and a markdown
 * string as the body.
 *
 * Key invariants:
 *  - `GeneratedResult` carries body + citations + confidence + warnings.
 *  - `ExtractedFieldValue` IS a `GeneratedResult` (its `citations`/`confidence`/
 *    `warnings` are the shared ones) narrowed to `{ fieldId, body }` where the
 *    body is the scalar field value. Existing fixtures (`{ fieldId, value,
 *    citations }`) MUST still parse — `value` is the persisted body alias.
 *  - `RenderedSection` is the same shape narrowed to `{ sectionId, body }`
 *    where the body is the section markdown.
 *  - `parseGeneratedResult` is the boundary sanitizer (parallels
 *    `parseCitations`/`parseTemplate`): malformed → `null`, unknown keys
 *    stripped.
 */

describe("GeneratedResult — shared generated-result shape", () => {
  it("accepts a body + citations + confidence + warnings", () => {
    const result: GeneratedResult = {
      body: "Generated section prose.",
      citations: [{ documentId: "d1", page: 1 }],
      confidence: 0.92,
      warnings: ["low-coverage"],
    };
    expect(generatedResultSchema.safeParse(result).success).toBe(true);
  });

  it("accepts a body with no confidence / warnings (both optional)", () => {
    const result: GeneratedResult = {
      body: 42,
      citations: [],
    };
    expect(generatedResultSchema.safeParse(result).success).toBe(true);
  });

  it("accepts every scalar body type (string / number / boolean / null)", () => {
    for (const body of ["s", 42, true, null] as const) {
      expect(generatedResultSchema.safeParse({ body, citations: [] }).success).toBe(true);
    }
  });

  it("rejects a missing citations array", () => {
    expect(generatedResultSchema.safeParse({ body: "x" }).success).toBe(false);
  });
});

describe("ExtractedFieldValue — extract specialization of GeneratedResult", () => {
  it("legacy fixture shape `{ fieldId, value, citations }` still parses", () => {
    const legacy = {
      fieldId: "amount_due",
      value: 18742.16,
      citations: [{ documentId: "utility-bill-2026-04", page: 1 }],
    };
    expect(extractedFieldValueSchema.safeParse(legacy).success).toBe(true);
  });

  it("carries the shared confidence + warnings (a GeneratedResult)", () => {
    const v: ExtractedFieldValue = {
      fieldId: "amount_due",
      value: 18742.16,
      citations: [{ documentId: "d1", page: 1 }],
      confidence: 0.8,
      warnings: ["unit-ambiguous"],
    };
    expect(extractedFieldValueSchema.safeParse(v).success).toBe(true);
  });

  it("requires fieldId", () => {
    expect(
      extractedFieldValueSchema.safeParse({ value: "x", citations: [] }).success,
    ).toBe(false);
  });
});

describe("RenderedSection — report specialization of GeneratedResult", () => {
  it("accepts `{ sectionId, body (markdown), citations }`", () => {
    const section: RenderedSection = {
      sectionId: "exec-summary",
      body: "## Executive Summary\n\nThe portfolio …",
      citations: [{ documentId: "d1", page: 3 }],
      confidence: 0.7,
    };
    expect(renderedSectionSchema.safeParse(section).success).toBe(true);
  });

  it("requires sectionId and a string body", () => {
    expect(
      renderedSectionSchema.safeParse({ body: "x", citations: [] }).success,
    ).toBe(false);
    expect(
      renderedSectionSchema.safeParse({ sectionId: "s", body: 42, citations: [] }).success,
    ).toBe(false);
  });
});

describe("parseGeneratedResult — boundary sanitizer", () => {
  it("returns the typed result for valid input, stripping unknown keys", () => {
    const parsed = parseGeneratedResult({
      body: "x",
      citations: [{ documentId: "d1", page: 1 }],
      bogus: "drop-me",
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("bogus");
  });

  it("returns null for malformed input", () => {
    expect(parseGeneratedResult({ citations: "nope" })).toBeNull();
    expect(parseGeneratedResult(null)).toBeNull();
  });
});
