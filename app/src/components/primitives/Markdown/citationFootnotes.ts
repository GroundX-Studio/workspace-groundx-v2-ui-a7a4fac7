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

/** Raw `[start, end)` offsets into a text run that cover a matched anchor phrase. */
export interface AnchorOffsets {
  start: number;
  end: number;
}

/**
 * Build the normalized form of `text` (same rules as `normalizeForMatch`:
 * strip `*_\`` emphasis, collapse runs of whitespace to one space, lowercased
 * for prose-tolerant anchor matching) WHILE recording, for each normalized
 * character, the raw index in `text` it came from. The trailing entry maps the
 * normalized length back to `text.length` so a match ending at the very end
 * resolves to a raw end offset.
 */
function normalizedWithMap(text: string): { norm: string; rawIndex: number[] } {
  let norm = "";
  const rawIndex: number[] = [];
  let inWhitespace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "*" || ch === "_" || ch === "`") continue; // emphasis markers dropped
    if (/\s/.test(ch)) {
      if (inWhitespace) continue; // collapse the run
      inWhitespace = true;
      norm += " ";
      rawIndex.push(i);
      continue;
    }
    inWhitespace = false;
    norm += ch.toLowerCase();
    rawIndex.push(i);
  }
  rawIndex.push(text.length); // sentinel so end offsets map cleanly
  return { norm, rawIndex };
}

/**
 * standardized-viewer-control T8 — the SAME normalization-tolerant matcher the
 * citation `answerSpan` aligner uses (`normalizeForMatch`'s emphasis-strip +
 * whitespace-collapse rules, plus case-folding since anchor phrases are prose,
 * not exact values), generalized to return the RAW first-occurrence offsets of
 * an arbitrary `phrase` inside a single text `run`. The remark plugin wraps that
 * raw slice as an inline clickable affordance. Returns `null` when the phrase is
 * absent (matching the citation aligner's "demote, never drop" floor — the
 * caller falls back to a pill so the offered action is never lost).
 *
 * An anchor that straddles a node boundary stays unmatched in this run (and
 * falls back to a pill) — a single contiguous wrap inside one text run is the
 * bound, by design. The plugin walks runs in document order and wraps the first
 * run that matches, so "first occurrence in the block" is preserved.
 */
export function anchorWrapOffsets(run: string, phrase: string): AnchorOffsets | null {
  const target = normalizeForMatch(phrase).toLowerCase();
  if (target.length === 0) return null;
  const { norm, rawIndex } = normalizedWithMap(run);
  const at = norm.indexOf(target);
  if (at < 0) return null;
  const start = rawIndex[at];
  const end = rawIndex[at + target.length];
  if (start == null || end == null) return null;
  return { start, end };
}
