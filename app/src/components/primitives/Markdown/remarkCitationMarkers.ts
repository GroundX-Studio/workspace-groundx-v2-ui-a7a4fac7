/**
 * inline-footnote-citations Phase B — the remark plugin that turns inline `[N]`
 * tokens into footnote markers in the mdast, so they render as `<CiteChip
 * variant="footnote">` (via a `sup` `components` override on the Markdown side).
 *
 * It walks each block's inline children left-to-right, accumulating the block's
 * preceding text so `splitTextRun`'s alignment check survives markdown formatting
 * (a bolded value lives in a sibling node). Text inside a `link` / `linkReference`
 * is skipped, so a real markdown link `[1](url)` is never mistaken for a marker;
 * `inlineCode` keeps its literal `[N]`. A dependency-free manual walk (no
 * `unist-util-visit`) keeps the markdown surface byte-identical when unused.
 */
import type { Citation } from "@groundx/shared";

import { splitTextRun } from "./citationFootnotes";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
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

function processChildren(node: MdNode, citations: Citation[]): void {
  if (!node.children) return;
  const out: MdNode[] = [];
  let preceding = "";
  for (const child of node.children) {
    if (child.type === "text") {
      const segs = splitTextRun(child.value ?? "", citations, preceding);
      for (const seg of segs) {
        out.push(
          seg.kind === "text"
            ? { type: "text", value: seg.value }
            : markerNode(seg.index, seg.citationIndex),
        );
      }
      preceding += child.value ?? "";
    } else {
      // A link / linkReference label must NOT be converted (so `[1](url)` stays a
      // link); recurse into every other container so markers inside emphasis,
      // list items, headings, table cells, etc. are still handled.
      if (child.type !== "link" && child.type !== "linkReference") {
        processChildren(child, citations);
      }
      out.push(child);
      preceding += textContent(child);
    }
  }
  node.children = out;
}

/**
 * Returns a unified ATTACHER (a `() => transformer` function). unified calls the
 * attacher to obtain the transformer, then runs the transformer on the tree —
 * so the citations are captured here and the inner function does the mutation.
 */
export function remarkCitationMarkers(citations: Citation[]) {
  return function attacher() {
    return (tree: MdNode): void => {
      processChildren(tree, citations);
    };
  };
}
