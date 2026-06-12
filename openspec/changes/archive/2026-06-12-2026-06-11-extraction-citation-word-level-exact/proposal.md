# Extraction citations: word-level exact-tier upgrade

## Why

The shipped extraction-grounded-citations change (archived
`2026-06-12-2026-06-11-extraction-grounded-citations`) resolves a validated
extraction citation's geometry via the WF-05 field resolver — a chunk-envelope
box at `tier: "paraphrase"`. The chat-routing spec named the word-level upgrade
as a MAY-evolution ("not wired"). But the cited `value` is verbatim by
construction (it matched the real extraction payload), so it can resolve
through the document's `-118-map` word map exactly like the snippet-quote arm
already does — a strictly tighter highlight and the `exact` tier, with zero new
infrastructure (resolver, cache, and dep seam all exist).

## What changes

- `verifyExtractionCitation` (`middleware/src/services/groundedAnswer.ts`),
  after the field resolver ships chunk geometry, resolves the validated value
  through `resolveWordGeometry` over the cached `-118-map`
  (`deps.wordMapFetch ?? fetchDocumentWordMap` — the same seam the snippet arm
  uses). An atom-run hit replaces the chunk box with the tight word box and
  lights `tier` via `assignTier(v, { hasAtomBox: true })` (`exact` for an
  exact-match value).
- Invariants preserved: drop-on-miss applies only to the chunk-level field
  resolver; the word-level pass is best-effort on top of an already-shippable
  citation — any miss/throw keeps `paraphrase` + chunk bbox, never drops, never
  fails the turn.
- Spec delta: the claim-level-citations requirement's MAY clause becomes
  SHALL-when-resolvable, with two new scenarios (upgrade hit; miss keeps
  paraphrase).

## Scope

- **In**: `verifyExtractionCitation`, `extractionCitations.test.ts`, the
  chat-routing spec delta.
- **Out**: snippet-arm behavior (already wired), `assignTier`/resolver/cache
  internals (unchanged), FE rendering (tiers already render).

## Conformance to core architectural decisions

- **Composable, not forked (1)**: no new axis or component — the extraction arm
  reuses the existing `wordMapFetch` seam, `resolveWordGeometry`, and
  `assignTier`, the exact mechanism the snippet arm composes. Second caller of
  the existing seam, not a near-dup.
- **Done = user-visible (5)**: proven by a routeChat-level test asserting the
  reply's citation tier + tight bbox the PdfViewer consumes; no dormant
  plumbing.
- **One source of truth (6)**: `Citation`/`CitationTier` stay on
  `@groundx/shared`; the durable spec at `openspec/specs/chat-routing/spec.md`
  is updated via this delta on archive.
