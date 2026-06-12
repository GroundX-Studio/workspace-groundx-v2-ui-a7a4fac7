# Design — extraction-grounded citations

## Context

`groundedAnswerOverScope` (middleware/src/services/groundedAnswer.ts) hands
the LLM two grounding sources: top-K search SNIPPETS and the primary
document's full EXTRACTED FIELDS block (`fetchDocumentExtraction`, a capped
JSON string from `/ingest/document/extract/{id}`). The citations contract
(`prompts/fragments.ts#CITATIONS_CONTRACT`) defines exactly one citation form:
a `quote` copied verbatim from a snippet, verified by `verifyQuote` against
the cited snippet's text and tiered by `assignTier`. Claims grounded only in
the extraction block therefore systematically carry zero citations.

Hard facts that bound the design:

- The extract payload carries field VALUES only — **no page, no geometry,
  ever** (WF-05 finding, restated in `citationGeometry.ts:458`). Per-field
  geometry must be recovered by matching the value against the document
  X-Ray. The resolver exists and is production-tested:
  `resolveFieldGeometry(value, label, xray)` (citationGeometry.ts:468),
  consumed today by `POST /api/documents/:documentId/field-geometry`
  (app.ts:1485) over the cached `fetchDocumentXray` (xrayCache.ts).
- `citationSchema` (`@groundx/shared`) requires `page`; tiers are
  `exact | paraphrase | ambient`. PdfViewer renders `ambient`+bbox as a soft
  dashed region and `ambient` without bbox as chip-only (no inline span).
- "Show all sources" seeds off `citations.length > 0` (ragPipeline.ts:206).
- No-invented-citations (2026-06-11) is locked: omission of the block on
  non-content turns ⇒ zero citations. This change must not weaken it.
- Base-state re-check (2026-06-12): the extraction fetch is already gated by
  the shipped `plan.extractionContext` flag; `verifiedCitations` now verifies
  each quote against ALL same-page chunks through the async embedder seam
  (`deps.quoteEmbedder` / `embedThreshold`); `fetchDocumentExtraction` is
  unchanged (still returns the capped string — the §2 plumbing change stands).

## 1. Contract — a second entry form, discriminated by shape

The fenced citations block gains a second permitted entry shape:

```json
{"citations":[
  {"documentId":"…","page":3,"quote":"<verbatim from a snippet>","answerSpan":"…"},
  {"documentId":"…","field":"meters[0].meter_number","value":"49099992", "answerSpan":"…"}
]}
```

- Discriminant: `quote`+`page` present ⇒ snippet-sourced (today's path,
  unchanged); `field`+`value` present ⇒ extraction-sourced. Entries with
  neither/both complete sets are filtered out by the parser (malformed).
- `field` is a path into the EXTRACTED FIELDS JSON in the dotted/bracket
  notation the model sees in the block (`meters[0].meter_number`). `value` is
  the value at that path, copied verbatim from the block — it is the proof
  the claim is grounded, playing the role `quote` plays on the snippet arm.
- **The extraction form is offered only when the extraction block exists.**
  `CITATIONS_CONTRACT` stays as-is; a new fragment
  `EXTRACTION_CITATIONS_CONTRACT` (prompts/fragments.ts — the drift-guarded
  home) is appended by `buildGroundedSystem` ONLY when `options.extraction`
  is non-null. No extraction block ⇒ byte-identical prompt to today.
- The no-block rule is untouched: jokes/small talk/product turns still omit
  the block and carry zero citations.

`parseGroundedAnswer` (ragPipeline.ts): `StructuredCitation` becomes a
two-arm union (`SnippetCitation` | `ExtractionCitation`), filter logic per
arm. Single declaration site; no shared-schema change needed for the
LLM-facing intermediate (it never crosses the wire).

## 2. Verification — validate against the payload, never trust the model

New branch inside the ONE `verifiedCitations` loop (groundedAnswer.ts), for
extraction-arm entries:

1. **Document check:** `documentId` must equal the extraction's document id
   (the `primaryDocId` the fetch ran for). Extraction is single-document;
   any other id is dropped (mirror of the CF-06 allowed-docIds cross-check).
2. **Path check:** `field` must resolve in the PARSED extraction payload
   (a small pure path-resolver over the object; no eval). Unresolvable ⇒
   dropped.
3. **Value check:** the cited `value` must match the value at the path,
   normalized the way `resolveFieldGeometry` normalizes (string coercion +
   `normalizeText` / `fieldValueCandidates` for currency/comma tolerance).
   Mismatch ⇒ dropped.

A failed extraction entry is DROPPED, not degraded to `ambient`: `ambient`
means "the model cited a real snippet but verification of the verbatim quote
failed"; a failed path/value check means the citation has NO real referent —
keeping it would re-open invented citations.

**Plumbing change:** `fetchDocumentExtraction` currently returns only the
capped prompt string; verification needs the parsed object (truncated JSON
does not re-parse). It returns `{ payload: unknown, promptBlock: string } |
null`; the prompt keeps the capped string, verification uses `payload`.
(Capping means the model can only cite fields it saw; validating against the
full payload is a strict superset — safe.)

Confidence: a validated extraction citation passed an exact structural check,
so it carries the same confidence a verified quote earns (`confidenceFor` of
a verified result) — verification here IS exact, only the geometry is looser.

## 3. Geometry — reuse the WF-05 field resolver; drop on miss

For each validated extraction entry (best-effort, never turn-failing):

- Fetch the document X-Ray via the existing cached `fetchDocumentXray`
  (at most once per document per turn — same cache the snippet path uses).
- `resolveFieldGeometry(value, label, xray)` with `label` = the last path
  segment (`meter_number`) as the tiebreaker, exactly as the Extract route
  does. **Hit** ⇒ citation gets the chunk-envelope `page` + `bbox`,
  `tier: "paraphrase"` (chunk-precision, same meaning as the snippet arm),
  `snippet: "<label>: <value>"` for the chip peek.
- **Miss** (or X-Ray unavailable) ⇒ the citation is **DROPPED** (user
  decision 2026-06-11). A citation ships only when it can point at a page;
  there is no pageless/document-level citation form. Accepted limitation:
  an extraction-grounded claim whose value cannot be located in the X-Ray
  shows no citation — rare, since the value originates from the document.
  Consequence: the shared `Citation` shape, persistence, hydrate, CiteChip,
  chip-click, and auto-highlight are ALL untouched — zero app-side work.

Rejected alternatives: (a) a pageless document-level citation
(`page` optional in `citationSchema`) — rejected by the user; (b) a new
`document` tier value — `tier` is the highlight-precision axis consumed by
PdfViewer and no renderer needs a fourth level (P1 guardrail); (c) faking
`page: 1` on a miss — dishonest highlight.

Deferred (ticketed, tasks.md, final task): word-level `exact` upgrade by
resolving the field value through the `-118-map` word map — the snippet
arm's upgrade path applies cleanly to a verbatim field value, but it is an
optics improvement, not the gap fix, and the chunk box ships first.

## 4. Tiering and the durable-spec language

The claim-level citations requirement is rewritten to define BOTH forms and
delete the Known-gap paragraph. The geometry requirement is re-scoped to
"snippet-sourced citations" and gains one clause delegating extraction-
sourced geometry to the field resolver. Scenario set covers: extraction-only
answer carries citations + chip; fabricated field path dropped; fabricated
value dropped; geometry hit ⇒ paraphrase+bbox; geometry miss ⇒ citation
dropped without failing the turn; joke still zero; extraction-form prompt
copy absent when no extraction block.

## 5. Coordination with related changes (both shipped — re-checked 2026-06-12)

**`2026-06-11-wire-embedding-verification` — shipped/archived.** The delta
collision is resolved: the durable requirement now carries the embedding
wording, and this change's delta was diff-verified to be a clean superset of
that durable text (additions only). No archive-order constraint remains.
Code: the extraction branch never calls `verifyQuote`, so the shipped
multi-chunk + embedder verify loop is untouched by it.

**`2026-06-11-turn-router-extraction-appstate` — shipped/archived.** The
`extractionContext` gate is live at the fetch site; gate `false` ⇒ no block ⇒
no extraction contract in the prompt ⇒ verification drops any extraction-form
entries. This change layers onto the shipped gate; no rebase needed.

## 6. Error handling

Every new step is best-effort: extraction-payload parse failure ⇒ extraction
entries dropped (snippet entries unaffected); X-Ray fetch/resolve failure ⇒
the extraction citation is dropped; nothing on this path may fail the chat turn.

## 7. Test strategy

- **User-visible first (T1):** through `routeChat` with a stubbed LLM whose
  answer cites only extraction fields over a fixture extraction + X-Ray:
  reply carries citations, Show-all-sources seeds, geometry-hit citation
  carries page+bbox.
- **Unit:** parser union arms; path resolver; verification drop cases
  (wrong doc / bad path / wrong value); geometry hit/miss tiers; prompt
  composition (fragment present iff extraction present — extends the
  prompts.test.ts + drift guard); `fetchDocumentExtraction` return shape.
- **App:** none — extraction citations reuse the shipped `Citation` shape;
  existing chip/click/hydrate suites cover them unchanged.
- **Regression:** all existing zero-citation scenarios (joke, product
  question, hybrid uncited) stay green untouched.
