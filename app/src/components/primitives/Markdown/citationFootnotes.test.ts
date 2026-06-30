import { describe, expect, it } from "vitest";

import type { Citation } from "@groundx/shared";

import { anchorWrapOffsets, normalizeForMatch, splitTextRun } from "./citationFootnotes";

/**
 * inline-footnote-citations Phase B — the PURE segmenter that turns a plain-text
 * run + the turn's citations into text/marker segments. The remark plugin feeds it
 * each mdast text run plus the block's accumulated preceding text (so alignment
 * survives markdown formatting like a bolded value before the marker).
 */
const cite = (over: Partial<Citation> = {}): Citation => ({
  documentId: "doc-1",
  page: 1,
  ...over,
});

describe("splitTextRun", () => {
  it("turns an in-range [N] with no answerSpan into a marker bound to citations[N-1]", () => {
    const segs = splitTextRun("the total is $7,613.20 [1].", [cite()]);
    expect(segs).toEqual([
      { kind: "text", value: "the total is $7,613.20 " },
      { kind: "marker", index: 1, citationIndex: 0 },
      { kind: "text", value: "." },
    ]);
  });

  it("leaves an OUT-OF-RANGE [N] as literal text (defensive, never throws)", () => {
    const segs = splitTextRun("see note [3] here", [cite()]); // only 1 citation
    expect(segs).toEqual([{ kind: "text", value: "see note [3] here" }]);
  });

  it("renders DUPLICATE [N] as two markers bound to the same citation", () => {
    const segs = splitTextRun("$5 [1] and again [1]", [cite()]);
    expect(segs.filter((s) => s.kind === "marker")).toEqual([
      { kind: "marker", index: 1, citationIndex: 0 },
      { kind: "marker", index: 1, citationIndex: 0 },
    ]);
  });

  it("ALIGNMENT: a [2] whose citation-2 answerSpan is NOT in the preceding text stays literal (no mis-binding)", () => {
    const citations = [cite({ answerSpan: "$5,193.30" }), cite({ answerSpan: "irrigation $591.12" })];
    // "[2]" sits after "electric is $5,193.30" — citation-2's span ("irrigation…") is absent → literal.
    const segs = splitTextRun("electric is $5,193.30 [2]", citations);
    expect(segs.some((s) => s.kind === "marker")).toBe(false);
    expect(segs).toEqual([{ kind: "text", value: "electric is $5,193.30 [2]" }]);
  });

  it("ALIGNMENT survives markdown formatting via block preceding-text (bolded value before the marker)", () => {
    const citations = [cite({ answerSpan: "$7,613.20" })];
    // The bolded value lives in a sibling `strong` node, so this text run starts at "[1]"
    // with empty local before-text; the block's preceding text carries the span.
    const segs = splitTextRun("[1].", citations, "The total amount due is $7,613.20");
    expect(segs).toEqual([
      { kind: "marker", index: 1, citationIndex: 0 },
      { kind: "text", value: "." },
    ]);
  });

  it("normalizeForMatch strips markdown emphasis and collapses whitespace", () => {
    expect(normalizeForMatch("the  **$7,613.20**  total")).toBe("the $7,613.20 total");
  });
});

/**
 * standardized-viewer-control T8 — the SAME normalization-tolerant matcher the
 * citation aligner uses, generalized to return the RAW first-occurrence offsets
 * of an arbitrary anchor phrase inside a single text run. The remark plugin uses
 * these offsets to wrap an offered-affordance phrase as inline clickable text.
 * Returns null when the phrase is not present in this run (→ caller falls back to
 * a pill so the action is never lost).
 */
describe("anchorWrapOffsets", () => {
  it("returns the raw [start,end) offsets of the first occurrence of the phrase", () => {
    expect(anchorWrapOffsets("open the report to compare", "the report")).toEqual({
      start: 5,
      end: 15,
    });
  });

  it("returns only the FIRST occurrence when the phrase repeats", () => {
    const text = "see the report, then the report again";
    const off = anchorWrapOffsets(text, "the report");
    expect(off).toEqual({ start: 4, end: 14 });
    expect(text.slice(off!.start, off!.end)).toBe("the report");
  });

  it("returns null when the phrase is absent from the run (→ pill fallback)", () => {
    expect(anchorWrapOffsets("nothing relevant here", "the report")).toBeNull();
  });

  it("matches across markdown emphasis + collapsed whitespace, returning the RAW slice that covers the phrase", () => {
    // The prose bolds the phrase + has doubled spaces; the normalized phrase still
    // matches and the returned raw offsets cover the literal markdown run.
    const text = "open  **the report**  now";
    const off = anchorWrapOffsets(text, "the report");
    expect(off).not.toBeNull();
    // The raw slice includes the emphasis markers it spans (so the wrap is contiguous).
    expect(text.slice(off!.start, off!.end)).toContain("the report");
  });

  it("is case-insensitive on the normalized comparison", () => {
    expect(anchorWrapOffsets("Open The Report", "the report")).not.toBeNull();
  });

  it("returns null for an empty phrase (never wraps the whole run)", () => {
    expect(anchorWrapOffsets("some text", "")).toBeNull();
  });
});
