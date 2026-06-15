# Tasks — multi-region citations

Three phases, ONE change. Sequential. Each task: TDD (failing test first) +
adversarial-review gate against the plan AND the real code before advancing.

## Phase 1 — backend proof-preservation (the heart)

- [x] **P1.0 — Spec delta FIRST — DONE.** MODIFIED 5 durable requirements + ADDED the
  never-drop multi-region requirement; closed the superseded geometry-miss change;
  validates --strict. (Checkbox was left unflipped earlier — work was complete.) SPEC:
  MODIFY "Chat citations SHALL carry page + normalized bbox…" (union→all regions;
  extraction miss drop→chunk floor; scenarios→multi-region/no-drop) and
  "RAG citations SHALL be claim-level…" (shape gains `regions[]`; validated
  grounding incl. branch-node descend never dropped, degrades to chunk floor;
  single-bbox tier clauses→region-set; Bucket-A drops + embedding gate UNCHANGED);
  ADD the never-drop-real-proof + all-regions + branchNode-descend requirement.
  `openspec validate --strict` green; durable-spec conflict check vs other active
  changes. Close `extraction-citation-geometry-miss-policy` as superseded here.
  - ↳ Review: the delta removes the geometry-drop + single-bbox + shape-unchanged
    clauses and adds nothing that contradicts a surviving requirement.

- [x] **P1.1 — `Citation.regions[]` shared shape with per-region tier (DONE).**
  **Sequencing refined in execution (same end state): `page`-OPTIONAL + the
  REGIONLESS citation → P1.3 (with its producer + consumer guards, keeps P1.1
  break-free); the two geometry WIRE CONTRACTS → P1.2 (grouped with the resolver
  that produces them); the RENDER-behavior `ambient` comments
  (PdfViewerWidget/CiteChip/ChatStoreContext) → P2.1 (comment lands with code).**
  Added `regions: {page, bbox, tier}[]` to the shared `citationSchema` as a new
  named `citationSourceRegionSchema` (named distinctly from the existing render-only
  color-overlay `CitationRegion`, left untouched); `page` STAYS REQUIRED here;
  first-region alias is bidirectional via `parseCitations`→`normalizeCitation`; new
  `citationRegions(c)` helper. Updated the H5 transport round-trip test. Contract
  test (6) + full middleware suite (932) green; app+mw tsc clean. Updated CONTRACT
  doc comments (shared `citationTierSchema`, app `CitationTier`). ALSO modify the "Citations SHALL survive the chat reply transport intact"
  requirement (H5 — it pins the old shape). TWO MORE wire contracts move from
  single-box to multi-region (Q1, review #6): `GroundXSearchResult.bbox` (single)
  → multi-region at the search layer, and the Extract endpoint's
  `ResolvedFieldGeometry` shape (`{page,bbox}`) → multi-region, with its app-side
  parser (`api/fieldGeometry.ts`) + the Extract widget consumption + their tests.
  Rebuild `shared/dist`. App + middleware tsc clean; the citation round-trip +
  parity tests green.
  ALSO update the `ambient` tier DOC COMMENTS to its new meaning — `ambient` now has
  two honest forms: a whole-PAGE marker for an unverified quote (R2), and a
  REGIONLESS source chip for a validated-but-unlocatable extraction value (review
  #8). The comments currently say only "no inline span / source chip only," which is
  stale vs the live soft-region code AND incomplete for the page-marker form:
  `shared/src/index.ts:54-58` (the `citationTierSchema` block), `app/src/types/onboarding.ts:38`,
  `app/src/contexts/ChatStoreContext/types.ts:408`, `PdfViewerWidget.tsx:116`,
  `CiteChip.tsx:84`. (Comment-only, but the contract must match the code.)
  - ↳ Review: every existing `.bbox`/`.page`/`.tier` reader still works (alias);
    no consumer breaks; one source of truth preserved; transport requirement +
    both geometry wire contracts updated together; no `ambient` doc comment still
    claims "no inline span".

- [x] **P1.2 — Geometry: every chunk has boxes, all chunks, no union (DONE).**
  Resolvers return `GeometryRegion[]` (per-box, no union except the legit word-span
  tighten); `valueMatchesChunk` = numeric whole-token / word whole-token-sequence
  (fixes `18.43 ∈ 118.437`, near-miss, distinctiveness floor); label tiebreaker
  removed (param kept for P1.3); `GroundXSearchResult.bboxes[]`; `/field-geometry`
  endpoint returns `regions[]` per field (app client projects to first region —
  full-grid render = P2.1); `groundedAnswer` snippet + extraction build multi-region
  citations. Middleware 940 + app 1734 green; both tsc; spec validates. NOTE:
  page-optional + the regionless citation were deferred to P1.3 (with the 4 consumer
  guards); never-drop seam preserved (extraction still drops-on-empty; unverified
  snippet still chunk-ambient — P1.3 changes both).
  UPGRADE the SHARED geometry layer to multi-region (NOT a separate resolver —
  app-wide, 2026-06-14). NOTE the real surface (Q2, review #6): `normalizeBox` (the
  union-to-one primitive) is called at THREE sites — result-carried boxes,
  `resolveGeometryFromXray` (snippet), `resolveFieldGeometry` (extraction) — so the
  "stop unioning → per-box regions" change moves the primitive (`NormalizedBbox` →
  `NormalizedBbox[]`) and all three resolvers, not one function. BOTH the grounded
  arm AND the Extract `/api/documents/:id/field-geometry` endpoint get it, so the
  Extract VALUE grid shows all-occurrence multi-region highlights too. NO CAP on
  region count (but bound by reality — see P1.4 scale note).
  RAG/snippet: use the retrieved chunk's boxes; when the search
  result is BARE (extract-workflow docs), fetch that chunk's boxes from the X-Ray
  (never bare-drop) — and note WHERE the snippet box is resolved (N4: today it's
  back-filled at SEARCH time in `groundxSearch`, not citation time; decide+document
  the stage). Extraction: locate the cited VALUE in the X-Ray by the value-exact,
  whole-token rule (R1, review #7) — **NUMERICALLY for numbers** (parse the value
  AND each numeric token to actual numbers; compare as numbers; match a whole
  numeric token so `7613.2` == `$7,613.20` but `18.43` ∉ `118.437` and ≠ `18.44`),
  **normalized whole-token for words** (not a substring, NOT semantic similarity,
  NOT the loose 0.5 token-overlap) → EVERY chunk it appears in → a region per match
  (precompute the normalized/numeric-tokenized chunk text once per X-Ray — N6);
  container → descend to its scalar leaf values (GENERIC tree walk) and locate EACH
  the same way; if an X-Ray chunk genuinely lacks a box (N5), degrade to a
  page-level region rather than empty. `-118-map` word file tightens when
  available. No union-to-one-envelope. SCHEMA-AGNOSTIC: no hardcoded
  attribute/field names.
  **This REPLACES three real defects in `resolveFieldGeometry` (citationGeometry.ts):**
  (1) the value match is `fieldValueCandidates` (formatted-string enumeration) +
  RAW SUBSTRING (`candidates.some((c) => raw.includes(c))`) — it correctly matches
  `7613.2`→`$7,613.20` TODAY (test :179 is green via the candidate `"7,613.20"`),
  but candidate `"18.43"` ALSO matches inside `"118.437"` (a substring false-positive
  that exists now) and an un-enumerated format (`7 613.20`) is missed; numeric
  whole-token comparison fixes both; (2) the field LABEL tiebreaker
  (`+ matchScore(labelNorm, chunkNorm) * 0.25`, line ~489) narrows to ONE chunk —
  REMOVE the tiebreaker ROLE (D1 = every occurrence; the label is schema-specific),
  but KEEP the `label` param — P1.3 reuses it as the last-resort LOCATOR for an
  unlocatable value; (3) it returns a single `normalizeBox` envelope — multi-region
  replaces it. RETAIN the F2 distinctiveness guard (`< 2` normalized chars,
  `groundedAnswer.ts:306`): a too-short/common value routes to P1.3's unlocatable
  fallback (chip), NOT a flood of regions — a locatability precondition, not a cap.
  Tests (new + re-based): bare search result resolves boxes via the X-Ray (not
  empty); **re-base :179** to assert numeric whole-token match (it MUST stay green —
  `7613.2` matches `$7,613.20`); **NEW: `18.43` inside `118.437` does NOT match**
  (the current substring matcher FAILS this — it's the core fix); near-miss `18.43`
  vs `18.44` does NOT match; `$ 7,613.20` (stray space after the currency mark) DOES
  match (the digit run is tokenized independent of `$`/spaces); **`18.43`
  appearing in TWO chunks now yields BOTH regions — INVERT the existing
  label-disambiguation test (citationGeometry.test.ts:191, which currently asserts
  the label picks ONE)**; a value in several X-Ray chunks yields a region per chunk;
  multi-line chunk → multiple regions; **a NON-utility-shaped payload (no
  `meters`/`meter_id`) resolves with no sample-specific field name in the code.**
  **R3 — existing tests to RE-BASE (citationGeometry.test.ts), the union→per-region
  surface:** `normalizeBox › "unions multiple boxes … into one envelope"` (:49) and
  `› "unions one page's boxes …"` (:40) → assert per-box regions, no envelope;
  `bboxForResult › "resolves the cited page's normalized envelope"` (:75) →
  region(s); `resolveGeometryFromXray › "matches a snippet … normalized geometry"`
  (:127) → `regions[]` shape; `resolveFieldGeometry › numeric/label` (:179, :191)
  per above. **KEEP** `resolveWordGeometry`'s atom-union tests (:228, :237) — a
  single verbatim span unioned into ONE tight word-run box is legitimate tightening,
  NOT the per-chunk envelope union being removed. Also re-base any `normalizeBox`
  refs in `extractionCitations.test.ts`.
  - ↳ Review: no union-to-one anywhere (word-run tightening exempt); every real
    grounding has ≥1 region; NO attribute name hardcoded (non-utility test proves
    it); the label tiebreaker is GONE (two-chunk test returns both); **the Extract
    `/api/documents/:id/field-geometry` endpoint NOW returns multi-region** (the
    value grid shows all occurrences — verify, don't preserve the old single box).

- [x] **P1.3 — Never-drop Bucket B (DONE).** `page` optional (shared) + 4 front-end
  consumer guards; `collectScalarLeaves` (generic, value-walk); `verifyExtractionCitation`
  restructured (scalar validate / container descend / never-drop fallback: label-locate
  → ambient region, else regionless ambient chip); `verifyAndTierSnippetCitation`
  unverified → whole-page ambient `{0,0,1,1}`. Only Bucket-A drops remain. New tests +
  5 re-based; middleware 946 + app 1734 green; both tsc; spec validates. ORIGINAL SPEC:
  `verifyAndTierSnippetCitation` emits `regions[]` (retrieved-chunk boxes, X-Ray
  when bare, word-tightened when available) AND, for an UNVERIFIED quote (exact →
  normalized → embedding all fail), keeps an `ambient` region = the CLAIMED PAGE
  (a whole-page marker on the cited document's page — NOT a guessed chunk/word box,
  since every more-precise check failed; R2, review #7), rendered "unconfirmed" —
  never dropped (Option A, 2026-06-14); `verifyExtractionCitation` validates
  the value vs the payload (exact/normalized — unchanged, no embeddings) and
  resolves a `branchNode` by descending the path to its scalar leaf values
  (GENERIC tree walk) and locating EACH via the §B match rule (numeric for numbers,
  normalized whole-token for words) → a region per place each value appears (never
  the former drop, never anchoring on an id field); a validated value always
  carries ≥1 X-Ray region WHEN PRINTED (the `geometry` drop of a printed validated
  value no longer occurs); a validated value that matches NO chunk (REFORMATTED —
  e.g. ISO date printed long-form — or DERIVED/not-printed; the
  "service_accounts blanked" class, `groundedAnswer.ts:330`) falls back
  (review #8): (1) last-resort locate by the GENERIC field label → that chunk region
  at `ambient`; (2) else a REGIONLESS `ambient` citation (validated, location
  unknown — a source chip), never dropped, never Bucket-A — the ONE pageless form,
  extraction-value-only. `docId`/`path`/`value` (value not matching the payload)
  still drop.
  Tests: cited container → a region per place its contained values appear (not
  dropped); validated value with no word box → its X-Ray chunk region (not dropped);
  **a validated value that matches no chunk (reformatted/derived) → label-located
  `ambient` region, else a regionless `ambient` citation — NOT dropped, NOT
  Bucket-A**; an unverified QUOTE (fails exact/near/embedding) → kept as an `ambient`
  "unconfirmed" region whose box is the CLAIMED PAGE (whole-page marker, NOT a
  guessed chunk box), not dropped; fabricated docId/path/value → still dropped; a
  non-utility payload shape works unchanged.
  - ↳ Review: funnel `branchNode`/`geometry` no longer terminal for a real
    grounding; Bucket-A drops intact; `verifyAndTierSnippetCitation`'s two callers
    (chat/report + extract) both emit regions.

- [x] **P1.3b — Extract VALUE grid multi-region — DONE.** `fetchFieldGeometry` now
  returns the FULL `FieldRegion[]` per field (was first-region projection);
  `liveValuesToFieldValues` builds a `Citation` carrying all regions (tier
  paraphrase) + the first-region alias; Extract's `liveGeometry` map + PdfViewer
  `highlightRegions` thread them → the grid lights every occurrence (render-merge
  collapses adjacent). Tests re-based (fieldGeometry, makeFakeApi); app 1745/mw 949
  green; tsc clean. ORIGINAL SPEC: The
  `/api/documents/:id/field-geometry` endpoint (app.ts) returns multi-region per
  field (from the upgraded shared resolver); the app maps it into the
  `ExtractedFieldValue.citations` multi-region `Citation` shape; the grid lights
  every occurrence. (Reverses the earlier "leave this path" — citation-wide.) Tests:
  a field value on several rows yields a region per row in the extract grid.
  - ↳ Review: the Extract value grid now shows all occurrences, multi-region,
    per-tier; no quote-embedding verification added here (values aren't paraphrases).

- [x] **P1.4 — P1 live re-probe DONE (2026-06-14, real GroundX + gpt-5.5 + embeddings).**
  `probe-citation-funnel.ts` over the real sample invoice, 8 adversarial queries:
  **8 turns · totalEmitted=50 · totalShipped=50 · ALL drop reasons = 0**
  (branchNode 0, geometry 0, value 0, path 0, docId 0, parse 0). The two formerly
  ZERO-citation answers ("list every charge", "list all meters + totals") now ship
  8 each. retry-backstop signal 0/8; geometry-miss 0. Live-verified the never-drop.
  Full app (1734) + middleware (946) suites green; both tsc; spec validates.
  REMAINING (folds into P2.1/scale-as-needed): worst-case region-count persistence
  check — deferred (probe reports funnel, not region counts; unit tests + the 50/50
  ship prove transport/DB feasibility). ORIGINAL SPEC: Re-run
  `probe-citation-funnel.ts` (cooperative + adversarial): the two formerly-blanked
  "list everything" answers now ship regions; `branchNode`/`geometry` terminal
  drops → 0; Bucket A unchanged. Full app + middleware suites + both tsc green.
  SCALE (Q3, review #6 — "no cap" is locked, but reality has ceilings): with no
  cap a "list everything" answer can persist many regions into
  `chat_messages.citations_json` (watch MySQL row / `max_allowed_packet` limits)
  and a multi-doc report scope (solar = 142 docs) fetches one X-Ray per doc — so
  precompute the normalized chunk text once per X-Ray, and confirm a worst-case
  citation set round-trips and renders without blowing a limit. Record the
  worst-case region count observed.
  - ↳ Review: evidence captured (before/after funnel + worst-case region count);
    no regression; no DB/transport-size failure on the worst case.

## Phase 2 — front-end (render all regions, APP-WIDE)

- [x] **P2.1 — DONE + live-verified.** PdfViewer renders all of a citation's
  `regions` per-tier (loop) + ambient full-page → page-marker; data path: shared
  `highlightCitation` intent gains `regions`; CiteChip + auto-highlight pass
  `citationRegions(c)`; `gotoDocViewer` slot + `ScopedCanvas` carry `highlightRegions`;
  SmartReport covered (renders CiteChip). 35 PdfViewer tests + app 1737/mw 946 green;
  tsc; spec valid. LIVE (real GroundX): "list every charge" shipped 8 citations
  (was 0), first = 84 regions / 449 total; clicking a citation drew 31 region
  overlays on page 2, 0 console errors. REMAINING: Extract VALUE grid multi-region
  (P1.3b remainder — `fetchFieldGeometry` first-region projection to thread). ORIGINAL SPEC:
  APP-WIDE — not just the chat overlay: `CiteChip` (used by chat, report, extract),
  the **Extract value grid** click→highlight, `SmartReportRender`, and the
  `PdfViewer` overlay all render every `region` of a citation, each colored by its
  OWN `tier` (D2). Reuse the existing multi-region `litRegions` path (already
  per-region); no new primitive. Reconcile the auto-highlight-on-arrival path
  (`useConversation` highlights `reply.citations[0]` → now its regions, P4 from
  review #5). On page change, re-render the viewed page's regions. No cap — the
  overlay draws arbitrary region counts.
  **Ambient page-marker (R2):** an `ambient` region carries a FULL-PAGE bbox
  (`{0,0,1,1}`). Render it as a distinct lightweight "unconfirmed — somewhere on
  this page" affordance (page-edge band / labeled corner marker), NOT by feeding
  the full-page bbox into the chunk-region painter (which would wash the whole page
  as one solid block — looks like a bug). This REPLACES the current `ambient`
  soft-chunk branch at `PdfViewerWidget.tsx:519`.
  Tests: a citation with N regions draws N highlights; a mixed-tier citation renders
  exact + paraphrase distinctly; **a full-page `ambient` bbox renders as the
  page-marker affordance, NOT a full-page solid fill**; click round-trips to all;
  the Extract grid lights every occurrence of a value. App suite green.
  - ↳ Review: every citation renderer updated (chat, report, extract); legacy
    single-region citations still render (alias → one region); the ambient
    page-marker is visually distinct and not a full-page wash; no overlay geometry
    regression (per `project_citation_highlight`); no per-surface exception.

## Phase 3 — prompt (fix the Bucket-A cause)

- [x] **P3.1 — Measure Bucket A — DONE (immaterial).** The P1.4 live probe (8
  adversarial queries) recorded `parse`/`docId`/`path`/`value` = **0** — the model
  emitted no fabricated citations. Bucket A is immaterial → P3 closes with the
  measurement; **P3.2 prompt tightening NOT triggered** (dropping stays the safety
  net). ORIGINAL SPEC: From the adversarial probe (+ any post-launch
  funnel), record `parse`/`docId`/`path`/`value` rates. If immaterial → close P3
  with the measurement (dropping is sufficient). Gate: numbers recorded.

- [ ] **P3.2 — Tighten the citations-contract prompt (only if material; spec-first).**
  If Bucket A is material, MODIFY the citations-contract wording (prompts module)
  to steer leaf field paths + retrieved docIds; spec wording change BEFORE the
  prompt edit; failing test first (a scripted model that over-cites containers
  shifts toward leaves). Re-probe to confirm the rate drops.
  - ↳ Review: prompt literals stay in the prompts module (guard); dropping remains
    the safety net; no regression to omission/parse.

## Closeout

- [ ] **Close.** Apply spec deltas (archive); update `docs/agents/data-model.md`
  (the `Citation` `regions[]` row + the never-drop policy); full suites + build +
  `validate --strict` green; final adversarial pass; archive the change. Mark
  `extraction-citation-geometry-miss-policy` closed (superseded).
