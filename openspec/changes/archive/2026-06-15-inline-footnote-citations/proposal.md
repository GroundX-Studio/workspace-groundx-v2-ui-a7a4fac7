# Inline footnote citations (app-wide)

## Why
Today every citation renders as a standalone numbered pill, and a chat answer maps
ALL of its citations to a flat wrapping row of those pills
(`chatPrimitives.tsx` `turn.citations.map(... <CiteChip index>)`). For an answer that
cites many things — e.g. "list every charge line item" → ~27 citations, almost all the
SAME document across 3 pages — this is a wall of meaningless numbered chips:

- the numbers convey nothing (no document, no page, no claim);
- the numbers are ORPHANED — the prose carries no inline markers, so the footer row maps
  to nothing the reader can see;
- massive redundancy — 27 atoms where there are ~3 real locations;
- no grouping, tiny tap targets, reads as error badges.

It is acceptable at 1–2 citations and collapses into noise at 5+.

## What Changes
Replace the detached chip row with the **footnote model**, applied **app-wide on every
surface that renders citations** (chat answers, extract field rows, report sections — the
shared production `CiteChip`, NOT any one frame):

1. **Inline markers** — a `[N]` superscript marker renders *inside the prose*, right after
   the claim it supports. Click keeps today's jump-to-region behavior.
2. **Collapsed grouped source list** — a one-line `⌄ N sources` affordance beneath the
   answer that expands to a list grouped by document → page, deduped
   (27 citations on one bill → "Utility bill · p.1 p.2 p.3").
3. **Never-drop** — every citation appears in the source list even if its inline marker is
   absent, preserving the locked citation philosophy (no real grounding is ever dropped).

The grounded prompt is extended so the model places `[N]` markers at each cited claim
(N = 1-based index into the existing `citations` array); the existing per-citation
`answerSpan` becomes the anchoring backup when a marker is missing.

SOURCE ATTRIBUTION: GroundX returns a human-readable `fileName` (and `sourceUrl`) on every
`search.results` chunk; the middleware reads `fileName` today but DROPS it before the citation,
so the UI can only show a `documentId` UUID. This change threads `fileName` + `sourceUrl` onto
the shared `Citation` (resolved by `documentId` from the matching chunk), so the `SourceList`
labels each group with the real document name and `CiteChip` tooltips name the document — using
data GroundX already returns rather than a UUID, a generic label, or a fabricated title.

This UNIFIES — rather than parallels — the existing citation requirements: the marker
becomes the affordance for the already-specced tiered claim model (`exact`/`paraphrase`/
`ambient` highlight precision), and it carries the canonical index-keyed colors so the
marker, its source-list chip, and its lit region stay one consistent unit. The two
overlapping lit-region-color requirements are reconciled onto a single color rule. Legacy
"F5"-named requirement headers are retained (renaming would churn the durable spec) but
their behavior is generalized to every surface app-wide.

## Status
PROPOSED — design approved 2026-06-15 (direction B "inline footnotes", scope "everywhere
CiteChip appears"). Not yet implemented.

## Conformance to core architectural decisions
- **No onboarding duplicates / app-wide** — the redesign targets the shared production
  `CiteChip` + a shared `SourceList`, used identically on chat, extract field rows, and
  report sections. No frame-specific ("F3/F5") fork — those are the same widgets app-wide.
- **Composable over forked** — `CiteChip` gains a `variant` axis value (`footnote`), not a
  parallel component; one shared `SourceList`, not a per-surface copy.
- **One source of truth** — citation shape stays the shared `@groundx/shared` `Citation`
  (`regions[]`); numbering stays 1-based per rendering unit, matching `citations[]` scope.
- **Never-drop citation philosophy** — the source list is the floor: every citation is
  reachable regardless of inline-marker success.
- **TDD + adversarial review** per the standing gates.
