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

/**
 * The citation's primary page (legacy alias, else the first region's page). A
 * citation that spans multiple pages (a multi-region extraction citation) is
 * LABELED by this primary page only — but never-drop still holds: its other
 * regions ride along on the entry's `citation`, so clicking the page row lights
 * EVERY region the citation supports (the label is first-page, the action is all).
 */
function pageOf(c: Citation): number | undefined {
  return c.page ?? citationRegions(c)[0]?.page;
}

/**
 * Fold `extra`'s regions into `base` so a same-page collision keeps EVERY region
 * (never-drop). Regions are deduped by page+bbox; `base`'s other fields win.
 */
function mergeRegions(base: Citation, extra: Citation): Citation {
  const all = [...citationRegions(base), ...citationRegions(extra)];
  const seen = new Set<string>();
  const regions = all.filter((r) => {
    const k = `${r.page}:${r.bbox.x},${r.bbox.y},${r.bbox.w},${r.bbox.h}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { ...base, regions };
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
    // Collapse to one entry per page within the document (regionless entries
    // collapse under a single "no page" key → one "location unknown" row). But
    // never-drop: a second citation on the SAME page MERGES its regions into the
    // kept entry, so clicking the page entry lights EVERY region on that page — no
    // grounding is lost just because two claims share a page.
    const pageKey = page == null ? "none" : String(page);
    const existing = group.entries.find((e) => (e.page == null ? "none" : String(e.page)) === pageKey);
    if (existing) {
      existing.citation = mergeRegions(existing.citation, citation);
      return;
    }
    group.entries.push({ index, page, citation });
  });
  return groups;
}
