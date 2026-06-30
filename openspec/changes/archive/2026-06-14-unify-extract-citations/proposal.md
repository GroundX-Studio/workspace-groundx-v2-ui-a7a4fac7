# Unify extract-field citations onto the shared verify + tier path

## Status: IN PROGRESS (2026-06-14)

## Why

There must be ONE citation approach for every grounded LLM completion. Today
chat, report, and hybrid all route citations through the shared verify-and-tier
pipeline (`verifiedCitations` → `verifyQuote` → `assignTier`/`confidenceFor` in
`groundedAnswer.ts` / `attribution.ts`): the LLM emits a verbatim quote, the
server verifies it against the cited chunk, and assigns a precision tier
(`exact` / `paraphrase` / `ambient`) + confidence.

**The Extract field path forks this.** `fieldExtractor.ts#parseLlmOutput` takes
the LLM's emitted `{documentId, page, quote}` and stores it as a narrow
`{documentId, page, snippet?}` citation with **no verification and no tier** —
the shared `extractFieldCitationSchema` was DELIBERATELY a structural subset
(documented in `shared/src/index.ts`: "the field-extract path never carries
bbox/tier/confidence"). So an Extract citation can point at a quote that isn't
actually in the document, and it has none of the confidence signal every other
citation in the product carries. That documented decision is what we are
reversing here.

## What changes

1. **One shared per-citation verifier.** Extract the per-snippet-citation
   verify → same-page-candidate scan → word-map upgrade → `assignTier` +
   `confidenceFor` block (today inline in `verifiedCitations`) into a reusable
   `verifyAndTierSnippetCitation(...)`. `verifiedCitations` calls it (behavior
   byte-identical — parity-guarded by the existing grounded citation tests).

2. **Extract uses it.** `fieldExtractor.extractField` runs the LLM's emitted
   citation quote through the SAME helper against its retrieved snippets,
   producing a verified, tiered `Citation` — or an `ambient`-tier citation when
   the quote doesn't verify (mirroring the grounded policy: an emitted-but-
   unverified quote survives as `ambient`, it is not silently dropped).

3. **Wire contract widened to the one Citation shape.** `extractFieldCitationSchema`
   stops being a bespoke subset and carries the verified-citation fields
   (`tier`, `confidence`, `bbox?`) so an Extract citation is the SAME shape as a
   chat/report citation. The shared `CiteChip` already renders `Citation`, so the
   app surface needs no rework.

4. **Deps threaded.** `ExtractFieldDeps` gains `quoteEmbedder?` + `embedThreshold?`
   (the same optional embedding gate the grounded path uses); the composition
   root (`app.ts` extract-field handler) passes them, exactly as it does for the
   chat/report routes.

## Non-goals

- NOT merging the LLM COMPLETION methods. Field extraction legitimately emits a
  typed scalar + confidence (not prose), compression emits a summary, planning
  emits a route — different output contracts, so one completion function there
  would be over-abstraction. This change unifies CITATIONS only.

## Collision note

`citation-retry-backstop` (NOT STARTED, data-gated) also targets
`verifiedCitations`. This change refactors that function (extracting the helper)
without changing its behavior; the backstop change rebases onto the helper.
