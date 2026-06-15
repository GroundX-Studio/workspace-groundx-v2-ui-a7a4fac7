import { describe, expect, it } from "vitest";

import type { Citation } from "@groundx/shared";

import { normalizeForMatch, splitTextRun } from "./citationFootnotes";

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
