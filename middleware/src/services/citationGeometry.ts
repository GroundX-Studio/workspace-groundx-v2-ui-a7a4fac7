/**
 * WF-03 — citation geometry helpers.
 *
 * GroundX search results (for layout-ingested docs) carry per-chunk
 * `boundingBoxes` (native page-pixel corners) + `pages` (page image dims).
 * These pure helpers turn that into the app's normalized 0-1 `{x,y,w,h}`
 * bbox that `PdfViewer.highlightBbox` / `litRegions` consume.
 *
 * Source-view guide rules honored here:
 *  - a chunk's boxes can span multiple pages → group by `pageNumber`, never
 *    union across pages (§5);
 *  - coordinates are native page-pixel; normalize by the matched page's
 *    width/height (§4.2).
 */

export interface BoundingBox {
  pageNumber: number;
  topLeftX: number;
  topLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
  corrected?: boolean;
}

export interface PageDim {
  number: number;
  width: number;
  height: number;
  imageUrl?: string;
}

export interface NormalizedBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Coerce a raw `result.boundingBoxes` array, dropping malformed entries. */
export function parseBoundingBoxes(raw: unknown): BoundingBox[] {
  if (!Array.isArray(raw)) return [];
  const out: BoundingBox[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const b = entry as Record<string, unknown>;
    if (
      isFiniteNumber(b.pageNumber) &&
      isFiniteNumber(b.topLeftX) &&
      isFiniteNumber(b.topLeftY) &&
      isFiniteNumber(b.bottomRightX) &&
      isFiniteNumber(b.bottomRightY)
    ) {
      out.push({
        pageNumber: b.pageNumber,
        topLeftX: b.topLeftX,
        topLeftY: b.topLeftY,
        bottomRightX: b.bottomRightX,
        bottomRightY: b.bottomRightY,
        corrected: typeof b.corrected === "boolean" ? b.corrected : undefined,
      });
    }
  }
  return out;
}

/** Coerce a raw `result.pages` array, dropping malformed entries. */
export function parsePages(raw: unknown): PageDim[] {
  if (!Array.isArray(raw)) return [];
  const out: PageDim[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry as Record<string, unknown>;
    if (isFiniteNumber(p.number) && isFiniteNumber(p.width) && isFiniteNumber(p.height)) {
      out.push({
        number: p.number,
        width: p.width,
        height: p.height,
        imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : undefined,
      });
    }
  }
  return out;
}

/** Bucket boxes by `pageNumber` — never merges across pages. */
export function groupByPage(boxes: BoundingBox[]): Map<number, BoundingBox[]> {
  const map = new Map<number, BoundingBox[]>();
  for (const b of boxes) {
    const list = map.get(b.pageNumber);
    if (list) list.push(b);
    else map.set(b.pageNumber, [b]);
  }
  return map;
}

/**
 * Union one page's boxes into an envelope and normalize by the page's
 * pixel dims → 0-1 `{x,y,w,h}`. Returns null when there are no boxes or the
 * page dims are unusable.
 */
export function normalizeBox(boxesOnOnePage: BoundingBox[], page: PageDim | undefined): NormalizedBbox | null {
  if (!boxesOnOnePage.length || !page || page.width <= 0 || page.height <= 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxesOnOnePage) {
    minX = Math.min(minX, b.topLeftX);
    minY = Math.min(minY, b.topLeftY);
    maxX = Math.max(maxX, b.bottomRightX);
    maxY = Math.max(maxY, b.bottomRightY);
  }
  return {
    x: minX / page.width,
    y: minY / page.height,
    w: (maxX - minX) / page.width,
    h: (maxY - minY) / page.height,
  };
}

/** The cited page for a result: `boundingBoxes[0].pageNumber` → `pages[0].number` → 1. */
export function pageOf(result: { boundingBoxes?: BoundingBox[]; pages?: PageDim[] }): number {
  return result.boundingBoxes?.[0]?.pageNumber ?? result.pages?.[0]?.number ?? 1;
}

/**
 * Resolve a result's cited page + normalized bbox from its boxes + page dims.
 * `bbox` is null when geometry is absent (caller leaves the citation geometry-less).
 */
export function bboxForResult(
  boundingBoxes: BoundingBox[],
  pages: PageDim[],
): { page: number; bbox: NormalizedBbox | null } {
  const page = pageOf({ boundingBoxes, pages });
  const onPage = groupByPage(boundingBoxes).get(page) ?? [];
  const pageDim = pages.find((p) => p.number === page);
  return { page, bbox: normalizeBox(onPage, pageDim) };
}

// --- X-Ray fallback resolver (WF-03 task 4) -------------------------------
// Used when a search result carries NO `boundingBoxes` (e.g. an extract-
// workflow-indexed doc). Match the citation snippet against the document's
// X-Ray chunks, then lift the matched chunk's geometry.

export interface XrayChunk {
  text?: string;
  suggestedText?: string;
  pageNumbers?: number[];
  boundingBoxes?: BoundingBox[];
}

export interface XrayDoc {
  chunks?: XrayChunk[];
  documentPages?: Array<{ pageNumber: number; width: number; height: number }>;
}

/** Normalize text for fuzzy matching: lowercase, strip non-alphanumerics, collapse spaces. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Containment/overlap score of `snippet` against `chunkText` in [0,1]. */
function matchScore(snippetNorm: string, chunkNorm: string): number {
  if (!snippetNorm || !chunkNorm) return 0;
  if (chunkNorm.includes(snippetNorm) || snippetNorm.includes(chunkNorm)) return 1;
  const snippetTokens = snippetNorm.split(" ").filter(Boolean);
  if (!snippetTokens.length) return 0;
  const chunkTokens = new Set(chunkNorm.split(" ").filter(Boolean));
  const hits = snippetTokens.filter((t) => chunkTokens.has(t)).length;
  return hits / snippetTokens.length;
}

/**
 * Resolve a snippet's page + normalized bbox from a document's X-Ray.
 * Matches the snippet against `chunks[].text`/`suggestedText`, lifts the best
 * chunk's cited-page boxes, normalizes via `documentPages` dims. Returns null
 * when nothing clears the match threshold.
 */
export function resolveGeometryFromXray(
  snippet: string,
  xray: XrayDoc,
  threshold = 0.5,
): { page: number; bbox: NormalizedBbox | null } | null {
  const snippetNorm = normalizeText(snippet);
  if (!snippetNorm || !Array.isArray(xray.chunks)) return null;

  let best: XrayChunk | null = null;
  let bestScore = 0;
  for (const chunk of xray.chunks) {
    if (!Array.isArray(chunk.boundingBoxes) || chunk.boundingBoxes.length === 0) continue;
    const score = Math.max(
      matchScore(snippetNorm, normalizeText(chunk.text ?? "")),
      matchScore(snippetNorm, normalizeText(chunk.suggestedText ?? "")),
    );
    if (score > bestScore) {
      bestScore = score;
      best = chunk;
    }
  }
  if (!best || bestScore < threshold) return null;

  const boxes = parseBoundingBoxes(best.boundingBoxes);
  const page = boxes[0]?.pageNumber ?? best.pageNumbers?.[0] ?? 1;
  const pageDims: PageDim[] = (xray.documentPages ?? []).map((p) => ({
    number: p.pageNumber,
    width: p.width,
    height: p.height,
  }));
  const onPage = groupByPage(boxes).get(page) ?? [];
  return { page, bbox: normalizeBox(onPage, pageDims.find((p) => p.number === page)) };
}

/**
 * Candidate string forms of a field value for RAW-substring matching against
 * chunk text. A numeric value (e.g. 7613.2) is also rendered with thousands
 * separators + 2 decimals so it matches a chunk printed as "$7,613.20".
 * (`normalizeText` alone can't — it splits "7,613.20" into "7 613 20".)
 */
function fieldValueCandidates(value: string | number | boolean | null): string[] {
  if (value == null || typeof value === "boolean") return [];
  const s = String(value).trim();
  if (!s) return [];
  const out = new Set<string>([s]);
  const cleaned = s.replace(/[^0-9.-]/g, "");
  if (cleaned && /\d/.test(cleaned)) {
    const n = Number(cleaned);
    if (Number.isFinite(n)) {
      out.add(String(n));
      out.add(n.toFixed(2));
      out.add(n.toLocaleString("en-US"));
      out.add(n.toLocaleString("en-US", { minimumFractionDigits: 2 }));
    }
  }
  return [...out].filter((c) => c.length >= 2);
}

/**
 * WF-05 — resolve an extract FIELD's source geometry from the document X-Ray.
 *
 * `document_getextract` returns field VALUES only (no geometry, ever — see
 * project_groundx_search_geometry.md), so a field's source region must be
 * recovered by matching its value against the X-Ray chunks. Primary match is a
 * raw-substring hit of any value candidate (handles currency/comma/decimal
 * formatting); the field `label` is a secondary tiebreaker when a value is
 * ambiguous (the same number appears in multiple chunks). Returns the
 * chunk-envelope box (covers the paragraph/table the value sits in),
 * normalized 0–1. Returns null on no match / empty value (caller ships the
 * field citation-less; highlight degrades to none).
 */
export function resolveFieldGeometry(
  value: string | number | boolean | null,
  label: string,
  xray: XrayDoc,
  threshold = 0.5,
): { page: number; bbox: NormalizedBbox | null } | null {
  if (!Array.isArray(xray.chunks)) return null;
  const candidates = fieldValueCandidates(value);
  if (!candidates.length) return null;
  const valueNorm = normalizeText(String(value));
  const labelNorm = normalizeText(label ?? "");

  let best: XrayChunk | null = null;
  let bestScore = 0;
  for (const chunk of xray.chunks) {
    if (!Array.isArray(chunk.boundingBoxes) || chunk.boundingBoxes.length === 0) continue;
    const raw = `${chunk.text ?? ""} ${chunk.suggestedText ?? ""}`;
    const chunkNorm = normalizeText(raw);
    // Primary: raw-substring hit of any candidate, else fuzzy token overlap.
    let score = candidates.some((c) => raw.includes(c)) ? 1 : matchScore(valueNorm, chunkNorm);
    // Secondary: nudge toward the chunk that also mentions the field label.
    if (labelNorm) score += matchScore(labelNorm, chunkNorm) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = chunk;
    }
  }
  if (!best || bestScore < threshold) return null;

  const boxes = parseBoundingBoxes(best.boundingBoxes);
  const page = boxes[0]?.pageNumber ?? best.pageNumbers?.[0] ?? 1;
  const pageDims: PageDim[] = (xray.documentPages ?? []).map((p) => ({
    number: p.pageNumber,
    width: p.width,
    height: p.height,
  }));
  const onPage = groupByPage(boxes).get(page) ?? [];
  return { page, bbox: normalizeBox(onPage, pageDims.find((p) => p.number === page)) };
}
