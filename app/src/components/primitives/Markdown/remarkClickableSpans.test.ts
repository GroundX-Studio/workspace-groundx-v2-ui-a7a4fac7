import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Citation } from "@groundx/shared";

import { remarkCitationMarkers } from "./remarkCitationMarkers";
import { consumedAnchorKeys, remarkClickableSpans } from "./remarkClickableSpans";

/**
 * standardized-viewer-control T8 — the GENERALIZED clickable-span remark plugin.
 * It is the same link/code-safe mdast walk that powers inline `[N]` citation
 * markers, PARAMETERIZED with a match-rule axis: citation `[N]` markers AND
 * offered-affordance anchor phrases, in ONE pass. This test exercises the mdast
 * mutation directly (no React) so the wrapping rules are unit-testable in
 * isolation — exactly like `citationFootnotes.test.ts` does for the segmenter.
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

const text = (value: string): MdNode => ({ type: "text", value });
const para = (...children: MdNode[]): MdNode => ({ type: "paragraph", children });
const root = (...children: MdNode[]): MdNode => ({ type: "root", children });

/** Apply the attacher → transformer to a tree (mutates in place) and return it. */
function run(tree: MdNode, plugin: ReturnType<typeof remarkClickableSpans>): MdNode {
  const transformer = plugin();
  transformer(tree);
  return tree;
}

/** Depth-first list of node types, for structural assertions. */
function types(node: MdNode): string[] {
  const out: string[] = [node.type];
  for (const c of node.children ?? []) out.push(...types(c));
  return out;
}

const cite = (over: Partial<Citation> = {}): Citation => ({ documentId: "doc-1", page: 1, ...over });

describe("remarkClickableSpans", () => {
  it("wraps an offered-affordance anchor phrase as an affordanceAnchor node carrying the action key", () => {
    const tree = root(para(text("Take a look at the report to compare line items.")));
    run(tree, remarkClickableSpans({ citations: [], anchors: [{ key: "tool:show_smart_report_render", phrase: "the report" }] }));
    const anchorNode = (tree.children![0].children ?? []).find((n) => n.type === "affordanceAnchor");
    expect(anchorNode).toBeDefined();
    expect(anchorNode!.data?.hName).toBe("span");
    expect(anchorNode!.data?.hProperties?.["data-affordance-key"]).toBe("tool:show_smart_report_render");
    // the matched phrase text is preserved inside the wrap
    expect((anchorNode!.children ?? []).map((c) => c.value).join("")).toContain("the report");
  });

  it("wraps ONLY the first occurrence of an anchor phrase", () => {
    const tree = root(para(text("the report here, and the report again")));
    run(tree, remarkClickableSpans({ citations: [], anchors: [{ key: "tool:x", phrase: "the report" }] }));
    const anchorCount = types(tree).filter((t) => t === "affordanceAnchor").length;
    expect(anchorCount).toBe(1);
  });

  it("leaves the prose byte-identical when the anchor phrase is NOT found (caller falls back to a pill)", () => {
    const tree = root(para(text("nothing here matches")));
    run(tree, remarkClickableSpans({ citations: [], anchors: [{ key: "tool:x", phrase: "the report" }] }));
    expect(types(tree)).toEqual(["root", "paragraph", "text"]);
    expect(tree.children![0].children![0].value).toBe("nothing here matches");
  });

  it("does NOT wrap an anchor phrase that sits inside a markdown link label", () => {
    const linkNode: MdNode = { type: "link", children: [text("the report")] };
    const tree = root(para(linkNode));
    run(tree, remarkClickableSpans({ citations: [], anchors: [{ key: "tool:x", phrase: "the report" }] }));
    expect(types(tree)).not.toContain("affordanceAnchor");
  });

  it("handles citation markers AND anchor phrases in ONE pass", () => {
    const tree = root(para(text("The total is $7,613.20 [1]. Open the report for detail.")));
    run(
      tree,
      remarkClickableSpans({
        citations: [cite()],
        anchors: [{ key: "tool:show_smart_report_render", phrase: "the report" }],
      }),
    );
    const t = types(tree);
    expect(t).toContain("citationMarker");
    expect(t).toContain("affordanceAnchor");
  });
});

/**
 * standardized-viewer-control T8 — the host (`LiveTurnList`) uses
 * `consumedAnchorKeys` to partition offered actions into inline vs. pill with the
 * SAME walk the render uses, so the two agree by construction and a not-found
 * anchor always falls back to a pill (never lost).
 */
describe("consumedAnchorKeys", () => {
  it("reports the keys whose phrase is found in the markdown source", () => {
    const placed = consumedAnchorKeys("Open the report to compare.", [
      { key: "tool:show_smart_report_render", phrase: "the report" },
    ]);
    expect(placed.has("tool:show_smart_report_render")).toBe(true);
  });

  it("does NOT report a key whose phrase is absent (→ pill fallback)", () => {
    const placed = consumedAnchorKeys("No relevant phrase here.", [
      { key: "tool:show_smart_report_render", phrase: "the report" },
    ]);
    expect(placed.has("tool:show_smart_report_render")).toBe(false);
    expect(placed.size).toBe(0);
  });

  it("does NOT report a phrase that only appears inside a markdown link label", () => {
    const placed = consumedAnchorKeys("see [the report](https://x.com) now", [
      { key: "tool:x", phrase: "the report" },
    ]);
    expect(placed.has("tool:x")).toBe(false);
  });

  it("matches across emphasis (the report bolded) via the shared normalizer", () => {
    const placed = consumedAnchorKeys("Open **the report** now", [
      { key: "tool:x", phrase: "the report" },
    ]);
    expect(placed.has("tool:x")).toBe(true);
  });

  it("returns an empty set when there are no anchors", () => {
    expect(consumedAnchorKeys("anything", []).size).toBe(0);
  });
});

/**
 * standardized-viewer-control T8 reinvention guardrail — there is exactly ONE
 * link/code-safe mdast walk (the parameterized `remarkClickableSpans`). The
 * `remarkCitationMarkers` entry point is a THIN delegate, NOT a near-duplicate
 * sibling plugin: it must not carry its own `processChildren` walk or its own
 * `hName` node builders. This asserts the "no second near-duplicate remark
 * module" gate at the source level (per principle 1: add an axis value, not a
 * fork).
 */
describe("no near-duplicate remark module (reinvention guard)", () => {
  const read = (rel: string): string =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("remarkCitationMarkers delegates to remarkClickableSpans (no independent walk)", () => {
    const src = read("./remarkCitationMarkers.ts");
    expect(src).toContain("remarkClickableSpans");
    // The walk + node builders live ONLY in the generalized module.
    expect(src).not.toMatch(/function processChildren/);
    expect(src).not.toMatch(/hName/);
  });

  it("remarkCitationMarkers and remarkClickableSpans produce the SAME citation wrapping (one mechanism)", () => {
    const cites = [cite()];
    const viaCitation: MdNode = root(para(text("Total $7,613.20 [1].")));
    const viaGeneral: MdNode = root(para(text("Total $7,613.20 [1].")));
    remarkCitationMarkers(cites)()(viaCitation);
    remarkClickableSpans({ citations: cites })()(viaGeneral);
    expect(types(viaCitation)).toEqual(types(viaGeneral));
  });
});
