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

// Canonical normalized 0-1 bbox now lives in the shared wire contract
// (`@groundx/shared`). Import for local use + re-export so existing middleware
// imports (`import { NormalizedBbox } from "./citationGeometry.js"`) resolve.
import type { NormalizedBbox } from "@groundx/shared";
export type { NormalizedBbox };

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

/** A normalized 0-1 page-relative box paired with its 1-indexed page. */
export interface GeometryRegion {
  page: number;
  bbox: NormalizedBbox;
}

/**
 * Normalize ONE page-pixel box to 0-1 `{x,y,w,h}` against its page's dims.
 * Returns null when the page dims are missing/unusable.
 *
 * multi-region-citations: a chunk's boxes are NO LONGER unioned into one loose
 * envelope — each box becomes its own region (see `normalizeBoxes`). The
 * envelope union survives only in `resolveWordGeometry`, where a single cited
 * SPAN's consecutive atoms legitimately tighten into one word-run box.
 */
export function normalizeBox(b: BoundingBox, page: PageDim | undefined): NormalizedBbox | null {
  if (!page || page.width <= 0 || page.height <= 0) return null;
  // Clamp into the page: a malformed/inverted X-Ray box (a corner outside the
  // page, or bottomRight < topLeft) must not draw an off-page, negative, or
  // oversized overlay. x/y clamp to [0,1]; w/h clamp to [0, 1-origin].
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const x = clamp01(b.topLeftX / page.width);
  const y = clamp01(b.topLeftY / page.height);
  return {
    x,
    y,
    w: Math.min(clamp01((b.bottomRightX - b.topLeftX) / page.width), 1 - x),
    h: Math.min(clamp01((b.bottomRightY - b.topLeftY) / page.height), 1 - y),
  };
}

/**
 * Per-box regions for a set of page-pixel boxes — ONE region PER box (no
 * union-to-one-envelope). Each box is normalized against its own page's dims;
 * a box whose page dims are missing is skipped.
 */
export function normalizeBoxes(boxes: BoundingBox[], pageDims: PageDim[]): GeometryRegion[] {
  const out: GeometryRegion[] = [];
  for (const b of boxes) {
    const bbox = normalizeBox(b, pageDims.find((p) => p.number === b.pageNumber));
    if (bbox) out.push({ page: b.pageNumber, bbox });
  }
  return out;
}

/**
 * Drop regions with an identical page + box (multi-region-citations). A
 * container citation that descends to many leaf values often matches the SAME
 * chunk repeatedly (one box per leaf), so the raw region set is heavy with exact
 * duplicates; this collapses them, preserving first-seen order. It removes only
 * EXACT duplicates — distinct occurrences are untouched (visual adjacency
 * merging is a separate, render-time concern).
 */
export function dedupeGeometryRegions(regions: GeometryRegion[]): GeometryRegion[] {
  const seen = new Set<string>();
  const out: GeometryRegion[] = [];
  for (const r of regions) {
    const key = `${r.page}|${r.bbox.x}|${r.bbox.y}|${r.bbox.w}|${r.bbox.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** The cited page for a result: `boundingBoxes[0].pageNumber` → `pages[0].number` → 1. */
export function pageOf(result: { boundingBoxes?: BoundingBox[]; pages?: PageDim[] }): number {
  return result.boundingBoxes?.[0]?.pageNumber ?? result.pages?.[0]?.number ?? 1;
}

/**
 * Per-box regions resolved from a result's own boxes + page dims, on the cited
 * page (`pageOf`). Empty when geometry is absent (caller leaves the citation
 * geometry-less). multi-region: one region per box, never a union envelope.
 */
export function bboxForResult(boundingBoxes: BoundingBox[], pages: PageDim[]): GeometryRegion[] {
  const page = pageOf({ boundingBoxes, pages });
  const onPage = groupByPage(boundingBoxes).get(page) ?? [];
  return normalizeBoxes(onPage, pages);
}

// --- X-Ray fallback resolver (WF-03 task 4) -------------------------------
// Used when a search result carries NO `boundingBoxes` (e.g. an extract-
// workflow-indexed doc). Match the citation snippet against the document's
// X-Ray chunks, then lift the matched chunk's geometry.

// 2026-06-01-data-model-tail item 4 — the canonical X-Ray type family is
// single-sourced on `@groundx/shared` (`SharedXrayChunk` / `SharedDocumentXrayResponse`).
// The middleware casts a raw `res.json()` (`xrayCache.ts`) and reads only a
// strict SUBSET of fields, so its working types are a runtime-tolerant
// RELAXATION of the canonical shape: every field optional, boxes loosened to
// the local `BoundingBox` (whose `corrected` is optional). They are DERIVED
// from the shared types (not hand-redeclared) so a canonical field the
// middleware reads cannot be dropped/renamed without breaking the
// assignability assert below.
import type {
  XrayChunk as SharedXrayChunk,
  XrayDocumentPage as SharedXrayDocumentPage,
  DocumentXrayResponse as SharedDocumentXrayResponse,
} from "@groundx/shared";

/** All fields optional, recursively — the runtime payload is untrusted. */
type DeepOptional<T> = T extends (infer U)[]
  ? DeepOptional<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepOptional<T[K]> }
    : T;

/** The fields the middleware reads off an X-Ray chunk (relaxed from canonical). */
export type XrayChunk = DeepOptional<
  Pick<SharedXrayChunk, "text" | "suggestedText" | "pageNumbers">
> & {
  // Loosened to the local `BoundingBox` (its `corrected` is optional) — the
  // middleware re-parses boxes via `parseBoundingBoxes` anyway.
  boundingBoxes?: BoundingBox[];
};

/**
 * The fields the middleware reads off an X-Ray doc. Top-level fields are
 * optional (untrusted payload); the page dims it consumes stay required (they
 * flow straight into `PageDim`, which requires them) — matching the original
 * middleware shape, now derived from the canonical type via `Pick`.
 */
export type XrayDoc = {
  chunks?: XrayChunk[];
  documentPages?: Array<Pick<SharedXrayDocumentPage, "pageNumber" | "width" | "height">>;
};

// --- drift guard (item 4): canonical ⊆ loose on the fields the middleware reads.
// The shared canonical strict shape MUST stay assignable to the loose middleware
// shape, so dropping/renaming a canonical field that the middleware reads breaks
// the build here. (Test-file asserts are invisible — the middleware tsconfig
// excludes `*.test.ts` — so this pin lives in a production module on purpose;
// it is type-only and emits nothing. The `Eq<>` precedent for the app side is
// `app/src/types/scenarios.drift.test.ts:52`.)
type Assert<T extends true> = T;
type _assertChunkAssignable = Assert<SharedXrayChunk extends XrayChunk ? true : false>;
type _assertDocAssignable = Assert<SharedDocumentXrayResponse extends XrayDoc ? true : false>;

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
): GeometryRegion[] {
  const snippetNorm = normalizeText(snippet);
  if (!snippetNorm || !Array.isArray(xray.chunks)) return [];

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
  if (!best || bestScore < threshold) return [];

  // multi-region: emit a region per box on the matched chunk's cited page (no
  // union envelope). The snippet is matched lexically (it's prose); the VALUE
  // path (`resolveFieldGeometry`) uses the stricter numeric/whole-token match.
  const boxes = parseBoundingBoxes(best.boundingBoxes);
  const page = boxes[0]?.pageNumber ?? best.pageNumbers?.[0] ?? 1;
  const pageDims: PageDim[] = (xray.documentPages ?? []).map((p) => ({
    number: p.pageNumber,
    width: p.width,
    height: p.height,
  }));
  const onPage = groupByPage(boxes).get(page) ?? [];
  return normalizeBoxes(onPage, pageDims);
}

// --- WF-05 value→chunk matching (multi-region-citations R1) ----------------
// LOCATING a cited extraction VALUE in a chunk is value-exact and whole-token,
// NOT a raw substring and NOT loose token-overlap. This REPLACES the former
// `fieldValueCandidates` + `raw.includes(candidate)` matcher, whose substring
// test false-matched a value INSIDE a larger number (`18.43` ⊂ `118.437`).
//   - Numbers: parse the value AND each numeric token in the chunk to actual
//     numbers; match a WHOLE numeric token (`7613.2` == `7,613.20` == `$7,613.20`
//     and even `$ 7,613.20`; `18.43` ≠ `18.44`; `18.43` ∉ `118.437`).
//   - Words/strings: normalized whole-token-SEQUENCE (a contiguous run of tokens,
//     not a substring of one token — `cat` does not match `category`).

const FLOAT_EPSILON = 1e-9;

/**
 * Parse a value to a number IFF it is a "pure number" form (optional currency
 * mark / sign / thousands commas / decimal / percent). Returns null for values
 * that aren't a bare number (e.g. `"Net 30"`, `"2024-01-15"`) — those go through
 * the word path. The distinctiveness floor: a number with fewer than 2 digits
 * (e.g. the integer `2`) is NOT distinctly locatable (it would match every `2`
 * on the page) → treated as non-numeric-locatable (returns null; the caller's
 * word path then also rejects it on length).
 */
function asLocatableNumber(value: string | number): number | null {
  const n =
    typeof value === "number"
      ? value
      : /^[$£€\s]*-?\d[\d,\s]*\.?\d*\s*%?$/.test(value.trim())
        ? Number(value.replace(/[^0-9.-]/g, ""))
        : NaN;
  if (!Number.isFinite(n)) return null;
  if (String(Math.abs(n)).replace(/\D/g, "").length < 2) return null; // F2 distinctiveness floor
  return n;
}

/**
 * Whole numeric tokens of a text, parsed to numbers (digit runs w/ commas + one
 * decimal; `$`/spaces are boundaries). A leading `-` is read as a SIGN only when
 * it is NOT preceded by a digit or dot — so a credit `-50.00` parses to `-50`,
 * while the hyphens in a date/range (`2024-01-15`) are separators, not signs.
 * An accounting-style parenthesized amount `(50.00)` is read as negative `-50`.
 */
function numericTokens(text: string): number[] {
  // Accounting convention: a number tightly wrapped in parens is negative. The
  // leading space ensures the synthesized `-` is read as a sign even when the
  // `(` abutted a digit (e.g. `5(50.00)` → `5 -50.00`); the space is a token
  // boundary, so it doesn't merge with the prior number.
  const normalized = text.replace(/\(\s*(\d[\d,]*(?:\.\d+)?)\s*\)/g, " -$1");
  const out: number[] = [];
  for (const m of normalized.matchAll(/(?<![\d.])-?\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Is `needle` a contiguous run of tokens inside `hay`? */
function tokenSequenceContained(needle: string[], hay: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Does the cited VALUE appear in the chunk text? Numbers compare numerically as
 * whole tokens; words/strings compare as a normalized whole-token-sequence.
 */
export function valueMatchesChunk(value: string | number, chunkText: string): boolean {
  const num = asLocatableNumber(value);
  if (num !== null) {
    return numericTokens(chunkText).some((t) => Math.abs(t - num) < FLOAT_EPSILON);
  }
  const needle = normalizeText(String(value)).split(" ").filter(Boolean);
  if (needle.join("").length < 2) return false; // F2 distinctiveness floor (words)
  return tokenSequenceContained(needle, normalizeText(chunkText).split(" ").filter(Boolean));
}

// --- WF-05b: word-level `-118-map` atom resolver -------------------------
// X-Ray gives chunk-level (paragraph/table) boxes — too coarse for a tight
// highlight (the Utility "amount due" chunk box lands on the payment stub, not
// the "$7,613.20" line). The `-118-map.json` carries WORD-level atom boxes; a
// cited VERBATIM span resolves to the union of the consecutive atoms that spell
// it out → a box strictly tighter than the chunk box. Feeds WF-06b's `exact`
// tier (`assignTier({ hasAtomBox: true })`). Verbatim-only — no paraphrase
// inference (a paraphrased answer has no word-level mapping; guide 08 §3/§10).
//
// Schema (groundx-api guide 08 §10.3; "unstable — use X-Ray for production",
// so every field is read defensively):
//   map.pages[].{ pageNumber, width, height, molecules[] }
//   molecule.rows[].atoms[]  (paragraph molecules)
//   molecule.children[].rows[].atoms[]  (figure molecules)
//   atom.{ text, minX, minY, maxX, maxY }  — page-pixel coords, same space as
//   search/X-Ray boxes. `text` includes trailing space; joining atoms in order
//   reproduces the molecule's `paraText`.

export interface WordAtom {
  text?: string;
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;
}

export interface WordMapPage {
  pageNumber?: number;
  width?: number;
  height?: number;
  molecules?: WordMapMolecule[];
}

export interface WordMapMolecule {
  rows?: Array<{ atoms?: WordAtom[] }>;
  children?: WordMapMolecule[];
}

export interface WordMap {
  pages?: WordMapPage[];
}

/** A page-pixel atom box paired with its normalized text token(s). */
interface PageAtom {
  norm: string; // normalizeText(atom.text) — may be "" for punctuation-only atoms
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Collect a molecule's atoms (recursing into figure `children`) in reading order. */
function collectMoleculeAtoms(mol: WordMapMolecule, out: WordAtom[]): void {
  if (Array.isArray(mol.rows)) {
    for (const row of mol.rows) {
      if (Array.isArray(row?.atoms)) {
        for (const a of row.atoms) if (a && typeof a === "object") out.push(a);
      }
    }
  }
  if (Array.isArray(mol.children)) {
    for (const child of mol.children) if (child && typeof child === "object") collectMoleculeAtoms(child, out);
  }
}

/** Flatten one page's atoms (reading order) into normalized-text + box pairs, dropping malformed boxes. */
function pageAtoms(page: WordMapPage): PageAtom[] {
  const raw: WordAtom[] = [];
  for (const mol of page.molecules ?? []) {
    if (mol && typeof mol === "object") collectMoleculeAtoms(mol, raw);
  }
  const out: PageAtom[] = [];
  for (const a of raw) {
    if (
      isFiniteNumber(a.minX) &&
      isFiniteNumber(a.minY) &&
      isFiniteNumber(a.maxX) &&
      isFiniteNumber(a.maxY)
    ) {
      out.push({
        norm: normalizeText(typeof a.text === "string" ? a.text : ""),
        minX: a.minX,
        minY: a.minY,
        maxX: a.maxX,
        maxY: a.maxY,
      });
    }
  }
  return out;
}

/**
 * Find the shortest consecutive run of atoms on a page whose joined normalized
 * text CONTAINS the normalized span, and union their boxes. Returns null when
 * no ordered run spells out the span (verbatim-only — a paraphrase won't match).
 */
function matchSpanOnPage(spanNorm: string, atoms: PageAtom[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const spanTokens = spanNorm.split(" ").filter(Boolean);
  if (!spanTokens.length) return null;
  const firstToken = spanTokens[0];

  // A run must BEGIN at the atom that contributes the span's first token —
  // otherwise a greedy scan from the page top would union every leading atom
  // into the envelope (e.g. "Industrial Electric" before "Demand 2,218.75").
  // From a valid start, extend until the joined normalized text contains the
  // span, then stop (shortest matching run = tightest box).
  for (let i = 0; i < atoms.length; i++) {
    if (!atoms[i].norm) continue; // skip punctuation-only atoms as a start
    const startTokens = atoms[i].norm.split(" ").filter(Boolean);
    if (!startTokens.includes(firstToken)) continue;
    let joined = "";
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let j = i; j < atoms.length; j++) {
      const a = atoms[j];
      joined = joined ? `${joined} ${a.norm}` : a.norm;
      const collapsed = joined.replace(/\s+/g, " ").trim();
      minX = Math.min(minX, a.minX);
      minY = Math.min(minY, a.minY);
      maxX = Math.max(maxX, a.maxX);
      maxY = Math.max(maxY, a.maxY);
      if (collapsed.includes(spanNorm)) {
        return { minX, minY, maxX, maxY };
      }
      // Prune: the run already overshoots the span length without containing it →
      // the span doesn't start at this atom; abandon this start.
      if (collapsed.length > spanNorm.length) break;
    }
  }
  return null;
}

/**
 * WF-05b — resolve a cited VERBATIM span to a tight word-level bbox from the
 * document's `-118-map.json`. Scans each page's atoms for the consecutive run
 * that spells out the span, unions their page-pixel boxes, and normalizes by
 * the page dims → 0-1 `{x,y,w,h}` (the same normalized space the chunk/X-Ray
 * boxes use, but strictly tighter). Returns the first page that matches, or
 * null when the span isn't present verbatim. PURE — word-map in, no fetch; the
 * live `-118-map.json` fetch is `wordMapCache.ts`, which feeds this resolver
 * from the chat router.
 */
export function resolveWordGeometry(
  span: string,
  map: WordMap,
): { page: number; bbox: NormalizedBbox } | null {
  const spanNorm = normalizeText(span ?? "");
  if (!spanNorm || !Array.isArray(map?.pages)) return null;

  for (const page of map.pages) {
    if (!page || typeof page !== "object") continue;
    if (!isFiniteNumber(page.width) || !isFiniteNumber(page.height) || page.width <= 0 || page.height <= 0) {
      continue;
    }
    const atoms = pageAtoms(page);
    if (!atoms.length) continue;
    const env = matchSpanOnPage(spanNorm, atoms);
    if (!env) continue;
    const pageNumber = isFiniteNumber(page.pageNumber) ? page.pageNumber : 1;
    return {
      page: pageNumber,
      bbox: {
        x: env.minX / page.width,
        y: env.minY / page.height,
        w: (env.maxX - env.minX) / page.width,
        h: (env.maxY - env.minY) / page.height,
      },
    };
  }
  return null;
}

/**
 * WF-05 — resolve an extract FIELD's source geometry from the document X-Ray.
 *
 * `document_getextract` returns field VALUES only (no geometry, ever — see
 * project_groundx_search_geometry.md), so a field's source region is recovered
 * by matching its value against the X-Ray chunks. multi-region-citations: the
 * value is located by `valueMatchesChunk` (numeric whole-token for numbers,
 * normalized whole-token-sequence for words — NOT a raw substring, NOT loose
 * token-overlap, NOT semantic similarity), and EVERY matching chunk yields its
 * per-box regions (D1 — show every occurrence; no narrowing to one chunk, and no
 * union-to-one envelope). Returns `[]` on no match / empty value (the caller
 * decides the fallback — P1.3 adds the label-locate + regionless degrade so a
 * validated value is never simply dropped).
 *
 * `label` is RESERVED for P1.3's last-resort locator (a value that matches no
 * chunk falls back to locating the field's label); it is intentionally unused
 * here — the value match no longer uses the label as a tiebreaker (that narrowed
 * "every occurrence" to one and was schema-specific).
 */
export function resolveFieldGeometry(
  value: string | number | boolean | null,
  label: string,
  xray: XrayDoc,
): GeometryRegion[] {
  void label;
  if (!Array.isArray(xray.chunks)) return [];
  if (value == null || typeof value === "boolean") return [];

  const pageDims: PageDim[] = (xray.documentPages ?? []).map((p) => ({
    number: p.pageNumber,
    width: p.width,
    height: p.height,
  }));

  const out: GeometryRegion[] = [];
  for (const chunk of xray.chunks) {
    if (!Array.isArray(chunk.boundingBoxes) || chunk.boundingBoxes.length === 0) continue;
    const text = `${chunk.text ?? ""} ${chunk.suggestedText ?? ""}`;
    if (!valueMatchesChunk(value, text)) continue;
    const boxes = parseBoundingBoxes(chunk.boundingBoxes);
    const page = boxes[0]?.pageNumber ?? chunk.pageNumbers?.[0] ?? 1;
    const onPage = groupByPage(boxes).get(page) ?? [];
    out.push(...normalizeBoxes(onPage, pageDims));
  }
  // Dedupe identical boxes (redundant X-Ray boxes, or a value matched in chunks
  // that share a box) so every caller — incl. the Extract `/field-geometry`
  // endpoint — gets a clean region set, not just the grounded chat arm.
  return dedupeGeometryRegions(out);
}
