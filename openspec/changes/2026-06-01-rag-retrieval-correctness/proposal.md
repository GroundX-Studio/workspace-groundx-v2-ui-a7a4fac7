# RAG retrieval correctness — answerable content must surface, with a regression suite

## Why

**Measured live (audit defect DL-1, 2026-06-01).** In onboarding chat, over the
seeded Utility sample (bucket **28454**, doc **c3bfff49**, the `utility` project
filter), the turn:

> "What is the total amount due on this bill?"

returns **0 citations** and the answer *"no snippets were found for this bill…
re-run extraction."* The RAG pipeline failed to ground an answer.

**The data IS present — this is a contradiction, not a missing-data case.** The
Extract workbench renders real values for the SAME doc over the SAME scope:
`balance_payable = 7613.2`, `addressee = "KWIK TRIP (1147)"`, `line_amount`,
`meter_id` (workflow `9910308e`, confirmed via `document_getextract`). So the
content the user asked for exists and is reachable through one surface (Extract)
but not the other (chat RAG). Live retrieval is failing to surface answerable
content that the platform demonstrably holds.

**Why this is load-bearing.** Chat-over-your-document is the primary onboarding
"aha" moment. A confident "no snippets found" on the first obvious question
(amount due) reads as "the product can't read my bill" — the worst possible
first impression. This is pre-launch; per the project's "do it the right way"
posture we fix the algorithm correctly AND lock it with a regression suite so it
cannot silently regress.

**What we already know about the pipeline (grounded in the real code, NOT yet a
diagnosis — the first task reproduces + isolates the failing stage).** The live
path is `runRagPipeline` (`middleware/src/services/ragPipeline.ts`) →
`groundedAnswerOverScope` (`groundedAnswer.ts`) → `searchGroundX`
(`groundxSearch.ts`) → `callGroundedLlm` + `parseGroundedAnswer` →
`verifiedCitations` (WF-06b verify→tier via `attribution.ts`). Two facts make
the current behavior suspect:

1. **The zero-result retry fires on EXACTLY zero results.** `searchGroundX`
   runs the initial search; only when `rawResults.length === 0` does it retry
   once with `relevance: RAG_FALLBACK_RELEVANCE` (default **-100**, set in
   `chatRouterTypes.ts`). If the first pass returns even ONE low-scored chunk,
   the low-floor retry NEVER fires — and a single weak chunk that the LLM can't
   use still yields "no snippets."
2. **The "extract-indexed → scores ~-30" assumption baked into the
   `RAG_FALLBACK_RELEVANCE` comment may be stale.** The geometry memory note's
   Corrections record that the Utility doc is NOT bare/extract-indexed anymore
   (a stray duplicate doc that shadowed it in 28454 was scourged); clean search
   now returns `c3bfff49` with full `boundingBoxes`+`pages` and OCR-layout
   `text`. If the doc now indexes as prose, the failing stage may instead be the
   scope→filter (the `utility` project filter not matching the doc's stored
   `filter` field), or geometry/snippet mapping — NOT the relevance floor.

These are competing hypotheses, deliberately unresolved here. The change's first
task captures a RECORDED real GroundX response and falsifies them against it.

## What Changes

- **Reproduce + instrument (chat-routing).** A deterministic middleware test
  using a RECORDED real GroundX search response for the utility "amount due"
  query over bucket 28454 / `utility` filter (captured via the GroundX MCP
  `search_content` / `search_documents` tools, saved as a fixture) asserts the
  CURRENT pipeline yields **0 usable snippets**. Add structured per-stage
  instrumentation (search request path/filter/n/relevance + raw result count at
  initial search AND low-floor retry) so the failing stage is named, not
  guessed.
- **Root-cause the algorithm (chat-routing).** Falsify each candidate against
  the recorded response: (a) scope→filter mismatch, (b) results returned but
  scored out, (c) low-floor retry not firing / floor still too high,
  (d) snippet text unusable by the prompt/parse, (e) genuinely no
  prose-searchable content → must read extract/X-Ray. State which stage fails
  and why, recorded in the change.
- **Fix the retrieval algorithm (chat-routing).** Implement the most
  correct/extensible fix the root-cause points to — e.g. make the low-floor
  pass reliable (fire it whenever the usable-snippet set is empty, not only on
  exactly-zero raw results), and/or correct the scope filter, and/or add an
  extract/X-Ray snippet fallback for genuinely prose-empty docs. The grounded
  answer SHALL cite real source chunks (WF-06b verify→tier preserved).
- **Regression test suite (chat-routing — the user's explicit ask).** A
  RAG-correctness harness of ground-truth Q&A pairs over the seeded sample,
  asserted against RECORDED GroundX fixtures (offline, deterministic, no live
  network in CI): each known-answerable query returns a grounded answer WITH
  citations + a non-empty snippet set + the correct tier. Plus a guard that a
  known-answerable query NEVER silently returns "no snippets."
- **Closeout.** `openspec validate --strict`, suites green, build clean, and a
  live re-verification that the chat answer for "amount due" now returns a
  grounded citation; then archive.

### Out of scope

- Re-ingesting the sample doc as plain layout (a separate WF-03 optimization).
- The Smart Report live-render path (the other `groundedAnswerOverScope`
  caller) — its correctness rides on the same fix but its own ground-truth suite
  is a follow-up if needed.
- Citation geometry/bbox precision (WF-03/WF-05) — owned elsewhere; this change
  asserts citations exist + tier, not pixel boxes.

## Conformance to core architectural decisions

- **Composable, not forked (principle 1).** The fix stays inside the existing
  single pipeline (`searchGroundX` / `groundedAnswerOverScope`) — we tune the
  retrieval ALGORITHM on the existing seam, not fork a second "extract-doc RAG"
  path. Any extract/X-Ray snippet fallback is an additional *value on the
  existing snippet-source axis* inside `searchGroundX`, consumed identically by
  `groundedAnswerOverScope`'s two callers (chat + report) — not a new component.
  No new abstraction is introduced without naming its second caller; if the
  root-cause is a one-line floor/filter fix, no abstraction is added at all.
- **TDD failing-first (principle 2).** Task 1 is a failing reproduction test
  (recorded fixture → current pipeline → asserts 0 usable snippets) BEFORE any
  fix.
- **Done = user-visible + round-trip (principle 5).** Closeout re-verifies the
  LIVE chat answer for "amount due" returns a grounded citation — not just a
  green unit test.
- **One source of truth (principle 6).** Reuses `@groundx/shared`
  `ContentScope` + `compileScopeFilter` + `GeneratedResult`; no twin types. The
  recorded fixtures are the single source for the regression suite's expected
  retrieval shape.
- **Adversarial review per task (principle 3 / discipline §10).** Each task
  carries a falsify-against-real-code gate before it advances.
