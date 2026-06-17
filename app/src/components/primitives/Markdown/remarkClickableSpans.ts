/**
 * standardized-viewer-control T8 — the GENERALIZED clickable-span remark plugin.
 *
 * This is the SAME link/code-safe mdast walk that `inline-footnote-citations`
 * shipped for `[N]` citation markers, PARAMETERIZED with a match-rule axis
 * (principle 1: add an axis value, not a fork). One walk handles BOTH:
 *   • citation `[N]` markers — wrapped as a `citationMarker` `sup` (unchanged
 *     behavior; `splitTextRun` decides which `[N]` is in range + aligned);
 *   • offered-affordance anchor phrases — the FIRST text run whose content
 *     contains the (normalization-tolerant) phrase has that slice wrapped as a
 *     clickable `affordanceAnchor` `span` carrying the suggested-action key.
 *
 * `remarkCitationMarkers` (its original name) is preserved as a thin wrapper
 * that passes only citation rules, so the no-anchor render stays byte-identical.
 *
 * A `link` / `linkReference` label is never converted (so a real markdown link
 * `[1](url)` or a linked phrase is left alone); `inlineCode` keeps its literal
 * text. A dependency-free manual walk (no `unist-util-visit`) keeps the markdown
 * surface byte-identical when unused.
 */
import { fromMarkdown } from "mdast-util-from-markdown";

import type { Citation } from "@groundx/shared";

import { anchorWrapOffsets, splitTextRun } from "./citationFootnotes";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

/** An offered-affordance anchor: wrap the first occurrence of `phrase` as a clickable. */
export interface AnchorRule {
  /** The `SuggestedAction.key` this anchor dispatches on click. */
  key: string;
  /** The prose phrase to wrap (first occurrence, normalization-tolerant). */
  phrase: string;
}

export interface ClickableSpanOptions {
  citations: Citation[];
  anchors?: AnchorRule[];
}

/** Flatten a node's text content (text + inlineCode carry a literal `value`). */
function textContent(node: MdNode): string {
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(textContent).join("");
}

/** A `[N]` marker as a `sup` element carrying its citation index + position. */
function markerNode(index: number, citationIndex: number): MdNode {
  return {
    type: "citationMarker",
    data: {
      hName: "sup",
      hProperties: { "data-cite-index": String(index), "data-cite-pos": String(citationIndex) },
    },
    children: [{ type: "text", value: String(index) }],
  };
}

/** A wrapped anchor phrase as a `span` element carrying its suggested-action key. */
function anchorNode(value: string, key: string): MdNode {
  return {
    type: "affordanceAnchor",
    data: {
      hName: "span",
      hProperties: { "data-affordance-key": key },
    },
    children: [{ type: "text", value }],
  };
}

/**
 * The mutable wrap state shared across the whole tree walk. `pendingAnchors` is
 * the set of anchor rules not yet placed — each is wrapped at its FIRST matching
 * text run (in document order) and then removed, so an anchor appears once.
 */
interface WalkState {
  citations: Citation[];
  pendingAnchors: AnchorRule[];
  /** Keys of anchors actually placed this walk (so the host can pill the rest). */
  placed: Set<string>;
}

function processChildren(node: MdNode, state: WalkState): void {
  if (!node.children) return;
  const out: MdNode[] = [];
  let preceding = "";
  for (const child of node.children) {
    if (child.type === "text") {
      const value = child.value ?? "";
      // 1) Anchor wrap: take the FIRST pending anchor that matches this run.
      //    Wrapping precedes citation segmentation so the wrapped slice keeps any
      //    `[N]` it contains as literal text (anchors are navigation prose, and a
      //    citation marker rarely lives inside an offered phrase). If two anchors
      //    match the same run, only the earliest-by-offset is placed this run; the
      //    other stays pending for a later run (still first-occurrence per anchor).
      const pushSegmented = (slice: string, before: string): void => {
        const segs = splitTextRun(slice, state.citations, before);
        for (const seg of segs) {
          out.push(
            seg.kind === "text"
              ? { type: "text", value: seg.value }
              : markerNode(seg.index, seg.citationIndex),
          );
        }
      };
      let anchorPlaced = false;
      for (let i = 0; i < state.pendingAnchors.length; i += 1) {
        const rule = state.pendingAnchors[i];
        const off = anchorWrapOffsets(value, rule.phrase);
        if (!off) continue;
        // Head + tail still flow through `splitTextRun` so a `[N]` outside the
        // wrapped slice (e.g. a citation before the offered phrase) stays a
        // marker; only the anchor slice itself is the clickable affordance.
        if (off.start > 0) pushSegmented(value.slice(0, off.start), preceding);
        out.push(anchorNode(value.slice(off.start, off.end), rule.key));
        if (off.end < value.length) {
          pushSegmented(value.slice(off.end), preceding + value.slice(0, off.end));
        }
        state.pendingAnchors.splice(i, 1);
        state.placed.add(rule.key);
        anchorPlaced = true;
        break;
      }
      if (!anchorPlaced) {
        // 2) Citation segmentation (unchanged path).
        pushSegmented(value, preceding);
      }
      preceding += value;
    } else {
      // A link / linkReference label must NOT be converted (so `[1](url)` stays a
      // link and a linked phrase is left alone); recurse into every other
      // container so markers/anchors inside emphasis, list items, headings, table
      // cells, etc. are still handled.
      if (child.type !== "link" && child.type !== "linkReference") {
        processChildren(child, state);
      }
      out.push(child);
      preceding += textContent(child);
    }
  }
  node.children = out;
}

/**
 * Returns a unified ATTACHER (a `() => transformer`). unified calls the attacher
 * to obtain the transformer, then runs it on the tree — so the options are
 * captured here and the inner function does the mutation.
 */
export function remarkClickableSpans(options: ClickableSpanOptions) {
  return function attacher() {
    return (tree: MdNode): void => {
      processChildren(tree, {
        citations: options.citations,
        // A fresh mutable copy per transform run, so the same plugin instance can
        // be reused without leaking placed-anchor state across renders.
        pendingAnchors: [...(options.anchors ?? [])],
        placed: new Set<string>(),
      });
    };
  };
}

/**
 * standardized-viewer-control T8 — which anchor `key`s the plugin WOULD place in
 * `markdownSource`, using the EXACT same link/code-safe walk + matcher as the
 * render (no second implementation). The host (`LiveTurnList`) partitions offered
 * actions with this: a placed key renders inline; everything NOT placed — no
 * anchor, phrase-not-found, or straddling a node boundary — renders as a pill, so
 * an action is never lost AND the inline render + the pill set agree by
 * construction. Parses with `mdast-util-from-markdown` (react-markdown's own
 * parser) so the measured node structure matches what is rendered.
 */
export function consumedAnchorKeys(markdownSource: string, anchors: AnchorRule[]): Set<string> {
  if (anchors.length === 0) return new Set();
  const tree = fromMarkdown(markdownSource) as unknown as MdNode;
  const state: WalkState = {
    citations: [],
    pendingAnchors: [...anchors],
    placed: new Set<string>(),
  };
  processChildren(tree, state);
  return state.placed;
}
