/**
 * inline-footnote-citations Phase C — PURE grouping for `SourceList`.
 *
 * Groups an answer's citations by document (first-seen order), dedupes by page
 * within a document, carries the document's `fileName`, and keeps each citation's
 * 1-based index (matching the inline `[N]` markers). Built from the FULL citations
 * array so every citation is represented — the never-drop floor.
 */
import { citationRegions, type Citation } from "@groundx/shared";

export interface SourceEntry {
  /** 1-based index into the answer's citations array (matches the inline marker). */
  index: number;
  /** 1-indexed page, or undefined for a regionless ("location unknown") citation. */
  page?: number;
  citation: Citation;
}

export interface SourceGroup {
  documentId: string;
  /** GroundX display name when the citation carried one; else undefined (FE falls back to documentId). */
  fileName?: string;
  entries: SourceEntry[];
}

/** The citation's primary page (legacy alias, else the first region's page). */
function pageOf(c: Citation): number | undefined {
  return c.page ?? citationRegions(c)[0]?.page;
}

export function groupSources(citations: Citation[]): SourceGroup[] {
  const groups: SourceGroup[] = [];
  const byDoc = new Map<string, SourceGroup>();
  citations.forEach((citation, i) => {
    const index = i + 1;
    const page = pageOf(citation);
    let group = byDoc.get(citation.documentId);
    if (!group) {
      group = { documentId: citation.documentId, entries: [] };
      byDoc.set(citation.documentId, group);
      groups.push(group);
    }
    if (!group.fileName && citation.fileName) group.fileName = citation.fileName;
    // Dedupe by page within the document (first wins); regionless entries dedupe
    // under a single "no page" key so a document lists one "location unknown" row.
    const pageKey = page == null ? "none" : String(page);
    if (group.entries.some((e) => (e.page == null ? "none" : String(e.page)) === pageKey)) return;
    group.entries.push({ index, page, citation });
  });
  return groups;
}
