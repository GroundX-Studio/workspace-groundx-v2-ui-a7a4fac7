# Design — multi-region citations

## The two buckets (the conceptual frame)

Every dropped citation is one of two kinds; the design treats them oppositely.

- **Bucket A — fabricated claim (KEEP rejecting):** `docId` (cited a doc not
  retrieved), `path` (field path doesn't resolve), `value` (cited value ≠ the
  extracted value), `parse` (malformed block). There is no real proof; showing
  it would be a false citation. These stay dropped — AND their rate is a PROMPT
  signal (P3).
- **Bucket B — real grounding, tossed (STOP dropping):** `branchNode` (cited a
  container that holds the real values) and `geometry` (validated value, no
  locatable box). Proof exists; the pin was too coarse or unfindable. These must
  degrade to a coarser highlight, never vanish.

## A. Data model — `regions: { page, bbox, tier }[]` (shared `Citation`)

`Citation` (shared Zod) gains `regions: { page: number; bbox: NormalizedBbox;
tier: CitationTier }[]` — **D2: each region carries its OWN tier** (a tight
word-box region is `exact`; a chunk-floor region is `paraphrase`), so a citation
with mixed-precision regions renders each honestly. The existing `page?` + `bbox?`
+ `tier?` are RETAINED as a derived "first region" alias for the migration window
(every current reader keeps working); new code reads `regions`. `regions` is page-tagged so a grounding that spans pages is one
citation with regions on each page. `parseCitations` (the wire sanitizer) maps
both shapes. Drift guard: the app⇄mw `Citation` re-export stays single-source.

## B. Geometry — every chunk has boxes; highlight all the chunks where the proof is

**Principle (user, 2026-06-14): a cited chunk ALWAYS has bounding boxes** — from
the retrieved search chunk (RAG), or from the document X-Ray, which always
carries chunk boxes. There is NO "bare → drop" path. (The sample is
extract-workflow-indexed, so its *search results* come back bare; the resolver
falls through to the X-Ray, which has the boxes.) Two paths, one rule — use the
chunk's boxes:

- **RAG / snippet citation:** use the RETRIEVED chunk's boxes; when the search
  result is bare, fetch that chunk's boxes from the X-Ray. The `-118-map` word
  file tightens to word-level boxes when available (best-effort upgrade).
- **Extraction citation:** locate the cited VALUE in the X-Ray by matching it
  against the chunk's tokens — **NUMERICALLY for numbers, as normalized text for
  words (R1, review #7):**
  - **Numbers:** parse the cited value AND each numeric token in the chunk to an
    actual number and compare NUMERICALLY, matching a value as a WHOLE numeric
    token. The extraction stores numbers plain (`60960`, `7613.2`); the document
    shows them formatted (`60,960`, `$7,613.20`); numeric comparison connects them
    (`7613.2` == `7,613.20` == `$7,613.20`) AND rejects `18.43` ≠ `118.437` and
    `18.43` ≠ `18.44`.
    - **Why this REPLACES the current matcher (be precise — the connection already
      half-works):** the word-normalization path (`normalizeText`) alone genuinely
      can't connect `7613.2` to `7,613.20` (it yields `7613 2` vs `7 613 20`), so
      the current `resolveFieldGeometry` bolts on a brittle workaround —
      `fieldValueCandidates` generates formatted strings (`toLocaleString` →
      `"7,613.20"`) and does a RAW SUBSTRING test (`raw.includes(...)`). That hack
      DOES match `7613.2` to `$7,613.20` today (test `citationGeometry.test.ts:179`
      is green), but its substring matching means candidate `"18.43"` matches INSIDE
      `"118.437"` (a false positive that exists right now). Numeric comparison —
      parse both sides, compare whole numeric tokens — removes that false positive
      by construction (`118.437` is one token ≠ `18.43`), and matches the real
      formatting cases (comma, `$`, trailing zero, a stray space after the `$`).
  - **Words/strings:** normalized (whitespace/punctuation/case folded),
    whole-token-sequence match (not a substring, not 0.5 token-overlap, not
    semantic similarity).
  Highlight EVERY chunk that matches (so a charge of "$18.43" on many rows lights
  every place). Any label is the generic last path segment, never a hardcoded
  attribute name. Word file tightens to the exact span when available.
- **Container (the former `branchNode`):** descend the cited path to its SCALAR
  leaf values (a plain tree walk — whatever they are), and locate EACH value's
  text in the X-Ray → highlight every place each value appears (a container's
  values are spread across the page; each can appear more than once; all are real
  proof). Do NOT anchor on a chosen identifier field.

**SCHEMA-AGNOSTIC (load-bearing).** The resolver hardcodes NO attribute names
(`meter_id`, `meters`, `usage_amount`, … are illustrative of THIS sample only).
It keys off the resolved VALUES via a generic tree walk + value-text match, so it
works identically for the utility meters, a loan packet, a solar portfolio, or a
BYO upload. A test SHALL exercise a non-utility-shaped payload to prove no field
name is baked in.
- **No union-to-one-envelope:** emit the individual per-line / per-chunk regions.
- **The floor always exists:** because the X-Ray always supplies chunk boxes, a
  validated grounding ALWAYS resolves to at least its chunk region — the former
  `geometry` drop of a validated value effectively disappears.

This REPLACES the earlier "grounding-chunk-only scope bound" — "all occurrences"
means every chunk where the cited value/attribute actually appears (RAG: the
retrieved chunks; extraction: the X-Ray match), not an artificial bound and not a
blind whole-doc text scan.

**APP-WIDE / CITATION-WIDE (user, 2026-06-14 — "citations are broken without
these fixes"; this REVERSES the earlier "leave the third path unchanged").** The
multi-region / show-all / never-drop / per-region-tier / token-boundary geometry
applies to EVERY citation surface, not just the grounded chat/report path:
- **Chat** citations, **Report** section citations, **Extract-field** citations,
  the **Extract VALUE grid** citations (`ExtractedFieldValue.citations` via the
  `POST /api/documents/:id/field-geometry` endpoint — the former "third path"),
  and the scenario sample citations — all use the SAME shared `Citation`
  (`regions:{page,bbox,tier}[]`).
- `resolveFieldGeometry` + `normalizeBox` are SHARED by the grounded path
  (`groundedAnswer.ts`) and the Extract endpoint — UPGRADE THE SHARED resolver to
  multi-region so BOTH callers benefit (no separate resolver). The Extract grid
  SHALL show all-occurrence multi-region highlights too.
- The ONLY thing that stays grounded-arm-specific is the quote-EMBEDDING
  verification (a quote can be a paraphrase; an extracted value is validated as
  the extracted value, never embedding-matched).
- **NO CAP.** Show every region — a value on many rows lights every one; a
  container fans out to all its values' places. The persistence (`citations_json`),
  the wire payload, and the overlay MUST handle arbitrary region counts
  EFFICIENTLY (precompute/batch; an overlay that draws many regions without
  choking) — never by truncating. (User: do not cap.)
- Every renderer (`CiteChip`, `Extract`, `SmartReportRender`, the PdfViewer
  overlay) renders multi-region, each region at its own tier.

## C. Never-drop policy (groundedAnswer.ts)

- `verifyAndTierSnippetCitation` (snippet arm): emit `regions[]` from the
  retrieved chunk's boxes (fetching them from the X-Ray when the search result is
  bare); tighten to word-level runs when the word file resolves.
- `verifyExtractionCitation` (extraction arm):
  - **Validate the value** against the payload — exact / normalized equality
    (unchanged; NO embeddings — a datum isn't paraphrased).
  - **LOCATE the value in the X-Ray by the §B match rule — NUMERICALLY for
    numbers, normalized whole-token for words (R1, review #7) — NOT semantic
    similarity and NOT loose token-overlap.** For a number, parse both the cited
    value AND each numeric token in the chunk to actual numbers and compare as
    numbers, matching a value as a whole numeric token (`7613.2` == `7,613.20` ==
    `$7,613.20`; `18.43` ∉ `118.437`; `18.43` ≠ `18.44`). For a word/string,
    require the value's normalized form to appear as a whole token-sequence.
  - **This REPLACES three defects in the current `resolveFieldGeometry`** (see §B
    for the numeric detail): (1) the value match is candidate-string + RAW
    SUBSTRING (`candidates.some((c) => raw.includes(c))`), so candidate `"18.43"`
    falsely matches inside `"118.437"` today, and the candidate enumeration misses
    formats it didn't anticipate — numeric whole-token comparison fixes both; (2)
    it uses the field LABEL as a tiebreaker to pick ONE chunk when a value appears
    in several (`citationGeometry.ts:489`) — D1 (show every occurrence) REMOVES that
    narrowing (the label is schema-specific anyway); (3) it returns ONE union
    envelope — multi-region replaces it. Embeddings are NOT used for location (they
    would match similar-but-different numbers).
  - **All occurrences:** highlight EVERY chunk that matches by the rule above
    (numeric for numbers, normalized whole-token for words) — the genuine repeats,
    e.g. the same charge on several meters. No label tiebreaker narrows to one.
  - **Distinctiveness precondition (RETAIN the F2 guard — review #8).** "Every
    occurrence" is every occurrence of a DISTINCT datum, not every appearance of a
    common token. A too-short / too-common value (the existing `< 2` normalized-char
    guard at `groundedAnswer.ts:306`; e.g. the integer `2`, the digit `0`) would
    match dozens of unrelated chunks — noise, not proof. Such a value is treated as
    NOT distinctly locatable → it routes to the unlocatable fallback below
    (label-locate, else a regionless `ambient` chip), NOT a flood of regions and NOT
    a drop. This is a locatability precondition, NOT a cap (the user's no-cap rule
    forbids truncating LEGITIMATE repeats; it does not require flooding on a
    degenerate match).
  - **Container (the former `branchNode`):** descend the path to its scalar leaf
    values (generic tree walk) and locate EACH by the same rule → a region per
    place each value appears — NEVER drop, NEVER anchor on an id field.
  - **geometry:** non-dropping for a validated value that's really in the doc — the
    X-Ray yields its chunk box; the word file tightens it when available.
  - **Validated-but-UNLOCATABLE value (review #8 — the honest limit of "never
    drop").** "Never drop a validated value" only achieves a region when the value
    is PRINTED in a way the match can find. A value can be validated against the
    extraction payload yet match NO chunk: a REFORMATTED value (an ISO date
    `2024-01-15` printed "Jan 15, 2024" — numeric can't parse it, normalized text
    `2024 01 15` ≠ `jan 15 2024`) or a DERIVED/computed value never printed. This is
    the class behind the earlier "service_accounts blanked" live drop. The current
    code drops it (`geometry`, `groundedAnswer.ts:330`). A two-step fallback keeps it
    from vanishing WITHOUT faking a location:
    1. **Last-resort LOCATOR by field LABEL** (the generic last path segment, e.g.
       `balance_payable` → "balance payable" — schema-agnostic, not a hardcoded
       name): if the value matched nothing but the LABEL matches a chunk, attach
       that chunk region at `tier: "ambient"` (we found the field's AREA, not the
       value — honest). NOTE this is a LOCATOR-of-last-resort when there are ZERO
       value matches; it is NOT the removed tiebreaker (that narrowed AMONG several
       value matches — different role, no conflict with "show every occurrence").
    2. **Regionless validated citation:** if neither value nor label locates, keep
       the citation with NO region at `tier: "ambient"` (validated against the
       payload, location unknown) — surfaced as a source chip, NOT dropped, NOT
       counted as a Bucket-A fabrication. This is the ONE pageless citation form,
       and ONLY for a validated extraction value (a quote always gets its claimed
       PAGE; this scalar has no page at all). It deliberately relaxes the old "no
       pageless citation form" rule for this single real-but-unlocatable case.
  - **Bucket A:** `docId` / `path` / `value` (the value not matching the payload)
    still dropped (no real referent).

**The LOCATION matcher is now uniform across both arms: numeric-for-numbers,
normalized-whole-token-for-words** (format-tolerant, value-exact, whole-token),
replacing the raw-substring + loose token-overlap matcher. VERIFICATION still
differs by form — and correctly so: a quote may be a PARAPHRASE (so the quote arm
keeps its exact → normalized → embedding gate), but an extracted value is a datum
(exact/normalized only, never fuzzy).

## D. Tiers — PER REGION (D2), set by a verification ladder

Tier is a property of each REGION, not the citation. A quote's region tier is set
by a 3-step ladder, strictest first (the existing `verifyQuote` gates):
1. **exact** — the quote's words are in the chunk verbatim → tight word-level box.
2. **paraphrase** — same words ignoring spacing/punctuation/case, OR same MEANING
   by the embedding check (cosine ≥ the constant threshold) → the matched chunk's
   region. Embeddings rescue a reworded-but-supported quote HERE (a confirmed,
   precise region at slightly lower confidence — NOT the unconfirmed case below).
3. **ambient (D1 decision A, 2026-06-14)** — ALL THREE above failed: the quote is
   not in the chunk by words OR by meaning (the model likely misremembered or
   made it up). We DO NOT drop it; we keep a region for the rough area the quote
   CLAIMED to come from, tagged `ambient` and rendered **"unconfirmed"** so the
   reader can see what the AI leaned on and catch a bad pick. **That region is the
   whole CLAIMED PAGE — a page-level marker, NOT a guessed chunk box (R2, review
   #7).** Rationale: every more-precise check failed, so we have no honest basis to
   point at a specific line or chunk; claiming chunk-level precision we couldn't
   verify would be a lie. The page is the finest thing we can stand behind (the
   citation names a document + page, and a whole-page highlight reads honestly as
   "somewhere on this page, unconfirmed"). So `ambient` IS a region tier (the
   unconfirmed claimed PAGE), NOT a no-region state — every quote citation still
   has ≥1 region.
   - **Representation:** a page-level region is the SAME `{page, bbox, tier}` shape
     with a full-page `bbox` (`{x:0, y:0, w:1, h:1}`) and `tier:"ambient"`. No new
     field, no nullable-bbox special case.
   - **This is a deliberate CHANGE to shipped `ambient` behavior, not just a new
     code path.** Today `ambient` is the SOFT CHUNK REGION of the best lexical-match
     chunk (`PdfViewerWidget.tsx:224`, `verifyAndTierSnippetCitation` ships
     `candidates[0].bbox`). The change: an unverified quote no longer borrows that
     chunk box (we couldn't confirm the quote belongs to it) — it gets the page.
     The shipped schema doc comment still calls `ambient` "no inline span → source
     chip" (`shared/src/index.ts:54-58`, and parallel comments in
     `app/src/types/onboarding.ts:38`, `ChatStoreContext/types.ts:408`,
     `PdfViewerWidget.tsx:116`, `CiteChip.tsx:84`) — ALREADY stale vs the live soft-
     region code, and now superseded again. P1.1 updates all of them to the
     page-marker meaning so the contract matches the code.

(A very short quote skips the embedding step — meaning-match of a tiny fragment is
unreliable — so it goes straight from a failed exact/near match to a page-level
`ambient` region.)

An extraction VALUE does NOT reach `ambient` through this quote-ladder: it's
validated against the payload (exact/normalized, no embeddings) and LOCATED by the
§B match rule (numeric for numbers, normalized whole-token for words); when located,
its regions are `exact`/`paraphrase` by geometry precision. It reaches `ambient`
ONLY via the §C unlocatable-value fallback (a label-located region, or a regionless
source chip when its on-page location is genuinely unknown) — `ambient` there means
"location uncertain," never "truth uncertain." The legacy citation-level `tier?`
alias = the first region's tier (migration only).

## E. Bucket-A prompt arm (P3)

The funnel already counts `parse`/`docId`/`path`/`value`. P3: measure their
share over the adversarial probe (+ post-launch soak); if material, tighten the
citations-contract prompt (in the prompts module) to steer the model toward leaf
field paths + retrieved docIds. Dropping stays the safety net; the prompt is the
cure. Spec/contract wording change lands before any prompt edit.

## F. Front-end (P2)

The PDF overlay already supports several regions at once via `litRegions`
("show all sources"). BUT the PRIMARY citation highlight today is single-box
(`PdfViewerWidget.highlightBbox`), and the CiteChip click sets one box. So P2 is
real wiring (not a rename): route a citation's `regions[]` into the multi-region
(`litRegions`) path for the clicked citation, so ONE citation lights ALL its
regions. No new highlight primitive — reuse the lit-region painter; a
single-region (aliased) citation still renders as one box.

**Ambient page-marker rendering (decide it, don't let the painter default).** An
`ambient` region is a full-page bbox (`{0,0,1,1}`). If that is fed straight into
the existing chunk-region painter, it paints the WHOLE page as one translucent
block — a heavy, ugly wash that looks like a bug. So P2 SHALL render an `ambient`
page region as a distinct, lightweight "unconfirmed — somewhere on this page"
affordance (e.g. a thin page-edge band / a labeled corner marker), visibly
different from an `exact` word box or a `paraphrase` chunk box. This replaces the
current `ambient` soft-chunk-region branch at `PdfViewerWidget.tsx:519` (which
expects a chunk-sized bbox). A test SHALL assert a full-page `ambient` bbox does
NOT render as a full-page solid fill.

## G. Spec changes (authored spec-first in each phase, per repo discipline)

The chat-routing durable spec is MODIFIED (P1 spec-first task):
- **"Chat citations SHALL carry page + normalized bbox…"** — the snippet arm's
  "bbox from the union of the result's boxes" becomes "all per-line/per-occurrence
  regions (never unioned to one envelope)"; the extraction arm's "on a miss the
  entry SHALL be dropped" becomes "falls back to the chunk region(s)"; its
  scenarios updated to multi-region + no-drop.
- **"RAG citations SHALL be claim-level, quote-verified, and tiered…"** — the
  clauses "on a geometry miss the entry SHALL be DROPPED … no pageless/
  document-level citation form, the shared `Citation` shape is unchanged" are
  rewritten: the shape gains `regions[]`; a validated grounding (incl. a
  branch-node descend) is never dropped, only degraded to the chunk floor; the
  single-`bbox` tier clauses become region-set clauses. Bucket-A drop clauses,
  the embedding gate, and the ambient-for-unverified-quote rule are UNCHANGED.
- A new ADDED requirement states the never-drop-real-proof + all-regions
  invariant plus the `branchNode`-descend behavior.

## H. Phasing (ONE change, sequential, each TDD + adversarial-reviewed)

- **P1 — backend proof-preservation** (the heart): spec delta first → `regions[]`
  model → multi-box geometry → never-drop Bucket B (descend + chunk floor). This
  is where the lost proof is recovered. Re-run the adversarial probe → the two
  formerly-blanked answers ship regions; `geometry`/`branchNode` drops → 0.
- **P2 — front-end**: render all regions per citation (overlay + CiteChip).
- **P3 — prompt**: measure Bucket A; tighten the contract if the rate justifies.
