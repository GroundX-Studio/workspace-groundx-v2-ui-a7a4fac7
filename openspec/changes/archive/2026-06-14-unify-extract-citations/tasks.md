# Tasks — unify-extract-citations

- [x] **T1 — Shared per-citation verify+tier helper (failing test first; parity).**
  Extract the inline per-snippet-citation block from `verifiedCitations`
  (`groundedAnswer.ts` ~443–496: same-page candidate scan → best `verifyQuote` →
  word-map upgrade → `assignTier` + `confidenceFor` → `Citation`) into a reusable
  `verifyAndTierSnippetCitation(quote, documentId, page, candidateSnippets, deps, opts?)`.
  `verifiedCitations` calls it. PARITY: the grounded citation tests stay green,
  byte-identical behavior (no tier/confidence/bbox change for chat/report/hybrid).
  - ↳ Review: grounded tests green unchanged; helper has 2 real callers
    (verifiedCitations + T3); no behavior delta in the funnel counts.

- [x] **T2 — Widen the shared extract-field citation to the Citation shape.**
  `extractFieldCitationSchema` carries `tier`/`confidence`/`bbox?` (align with the
  one `Citation` shape) — reverse the documented "structural subset" note in
  `shared/src/index.ts`; update that comment. `schemaFieldExtractionResultSchema`
  inherits it. Rebuild `shared/dist`. App + middleware tsc clean.
  - ↳ Review: the wire-shape parity test (app⇄mw `ExtractFieldResult`) green;
    `CiteChip` renders the widened citation (already takes `Citation`).

- [x] **T3 — fieldExtractor verifies + tiers its citation (failing test first).**
  `ExtractFieldDeps` gains `quoteEmbedder?` + `embedThreshold?`. After
  `parseLlmOutput`, run the emitted quote through `verifyAndTierSnippetCitation`
  against the retrieved snippets → a tiered `Citation` (verified → `exact`/
  `paraphrase`; unverified emitted quote → `ambient`, not dropped; no quote → no
  citation). Failing tests: quote verbatim in snippet → `paraphrase`+ (or `exact`
  with word-map); quote absent → `ambient`; the documentId-not-in-snippets drop
  is preserved.
  - ↳ Review: extract citation now carries a tier for every emitted citation; the
    no-snippet / not-allowed-doc paths still yield `null`.

- [x] **T4 — Composition root threads the embedder.** `app.ts` extract-field
  handler passes `quoteEmbedder` + `embedThreshold` into `extractField` deps
  (same source as the chat/report routes). No new env.
  - ↳ Review: a live-shaped extract call carries the embedder; absent embedder
    degrades to lexical-only verification (never-fail), same as grounded.

- [x] **T5 — End-to-end + spec + close.** App-side `extractField` test asserts the
  tiered citation round-trips the wire. Apply the spec delta (onboarding-schema-editor).
  Full app + middleware suites + both tsc + `validate --strict` green. Adversarial
  review: one citation approach everywhere — Extract, chat, report, hybrid all
  verify + tier identically; no duplicated verify logic.
