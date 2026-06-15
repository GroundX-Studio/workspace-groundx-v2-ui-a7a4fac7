/**
 * inline-footnote-citations Phase B — the PURE footnote segmenter.
 *
 * Turns a plain-text run + the turn's citations into text/marker segments. A
 * `[N]` becomes a marker only when it is in range AND aligned to its citation
 * (see `splitTextRun`); otherwise it stays literal text. The remark plugin
 * (`remarkCitationMarkers`) calls this per mdast text run, passing the block's
 * accumulated preceding text so alignment survives markdown formatting (a bolded
 * value lives in a sibling node, so the local run may start at the marker).
 *
 * Keeping this pure (no React, no mdast) makes the binding rules unit-testable in
 * isolation and prevents a mis-numbered marker from pointing at the wrong source.
 */
import type { Citation } from "@groundx/shared";

import type { CiteChipColor } from "@/components/brand/CiteChip/CiteChip";

/**
 * The canonical index/confidence-keyed citation color, SHARED by the inline
 * footnote marker and the SourceList pill so a citation reads as one unit:
 * `[1]` green (primary), low-confidence coral, else cyan.
 */
export function citationColor(index: number, c: Citation): CiteChipColor {
  if (c.confidence != null && c.confidence < 0.5) return "coral";
  return index === 1 ? "green" : "cyan";
}

export type FootnoteSegment =
  | { kind: "text"; value: string }
  | { kind: "marker"; index: number; citationIndex: number };

/** Strip markdown emphasis markers + collapse whitespace for tolerant matching. */
export function normalizeForMatch(s: string): string {
  return s
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MARKER_RE = /\[(\d+)\]/g;

/**
 * Split a single plain-text run into text/marker segments. A `[N]` becomes a
 * marker only when (a) 1 <= N <= citations.length AND (b) the citation has no
 * `answerSpan` OR that span (normalized) appears in the normalized text before
 * the marker — `precedingText` (the block's accumulated text up to this run) plus
 * the run's own leading text. An out-of-range / unaligned / coincidental `[N]`
 * stays literal. An unbound citation is still reachable via the SourceList
 * (the never-drop floor), so demoting here is always safe.
 */
export function splitTextRun(
  text: string,
  citations: Citation[],
  precedingText = "",
): FootnoteSegment[] {
  const segs: FootnoteSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const n = Number(m[1]);
    const citation = citations[n - 1];
    const inRange = n >= 1 && n <= citations.length;
    const before = precedingText + text.slice(0, m.index);
    const aligned =
      inRange &&
      (!citation?.answerSpan ||
        normalizeForMatch(before).includes(normalizeForMatch(citation.answerSpan)));
    if (!aligned) continue; // leave the [N] in the trailing literal text
    if (m.index > last) segs.push({ kind: "text", value: text.slice(last, m.index) });
    segs.push({ kind: "marker", index: n, citationIndex: n - 1 });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ kind: "text", value: text.slice(last) });
  return segs.length > 0 ? segs : [{ kind: "text", value: text }];
}
