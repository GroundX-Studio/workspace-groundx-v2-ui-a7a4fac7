import { describe, expect, it } from "vitest";

import type { Citation } from "@groundx/shared";

import { groupSources } from "./sourceGroups";

/**
 * inline-footnote-citations Phase C — the PURE grouping for SourceList: group
 * citations by document (first-seen order), dedupe by page within a document,
 * carry the document's fileName, and keep each citation's 1-based index. Built
 * from the FULL citations array (never-drop floor).
 */
const cite = (over: Partial<Citation> = {}): Citation => ({ documentId: "doc-1", page: 1, ...over });

describe("groupSources", () => {
  it("groups by documentId (first-seen order) and dedupes by page", () => {
    const groups = groupSources([
      cite({ documentId: "doc-1", page: 1 }),
      cite({ documentId: "doc-1", page: 1 }), // dup page → dropped
      cite({ documentId: "doc-1", page: 2 }),
      cite({ documentId: "doc-2", page: 1 }),
    ]);
    expect(groups.map((g) => g.documentId)).toEqual(["doc-1", "doc-2"]);
    expect(groups[0].entries.map((e) => ({ index: e.index, page: e.page }))).toEqual([
      { index: 1, page: 1 },
      { index: 3, page: 2 },
    ]);
    expect(groups[1].entries).toEqual([{ index: 4, page: 1, citation: groups[1].entries[0].citation }]);
  });

  it("carries the document's fileName onto its group", () => {
    const groups = groupSources([
      cite({ documentId: "doc-1", page: 1, fileName: "utility-bill-april-2026.pdf" }),
    ]);
    expect(groups[0].fileName).toBe("utility-bill-april-2026.pdf");
  });

  it("never drops a regionless citation (no page) — it is listed for its document", () => {
    const groups = groupSources([cite({ documentId: "doc-9", page: undefined, regions: undefined })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toEqual([
      { index: 1, page: undefined, citation: groups[0].entries[0].citation },
    ]);
  });

  it("derives page from the first region when the legacy page alias is absent", () => {
    const groups = groupSources([
      cite({ documentId: "d", page: undefined, regions: [{ page: 4, bbox: { x: 0, y: 0, w: 1, h: 1 }, tier: "paraphrase" }] }),
    ]);
    expect(groups[0].entries[0].page).toBe(4);
  });
});
