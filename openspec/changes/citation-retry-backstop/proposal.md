# Citation retry backstop — data-gated follow-up

## Status: NOT STARTED — gated on funnel data (T-DEFER-1 of 2026-06-12-harden-citation-emission)

## Why

`harden-citation-emission` (archived 2026-06-12) fixed the dominant
citation-omission causes (MUST-cite contract, tolerant parser, structural
truncation) — the live probe went from ~40% to 6/6 tax-question runs
shipping citations. A residual loss mode remains visible in the new
`citationFunnel` log: one probe run emitted 4 entries and lost 3 at parse
(arm-invalid entries), shipping only 1.

## Decision gate (do this FIRST — the change may be a no-op)

Measure the funnel over real usage soak: rate of grounded content turns with
`emitted > 0 && shipped === 0` or `emitted === 0` (vs the turn actually
drawing on documents). If the residual rate is immaterial, CLOSE this change
with the measurement recorded — do not build the backstop.

## What (only if the gate trips)

One cheap retry when a rag-mode turn with non-empty snippets produces a
content answer with zero emitted citations: re-ask the model for ONLY the
citations block over the existing transcript. Bounded to one retry; adds
latency only to misses. If parse-losses (not omission) dominate instead,
fix the emission shape (e.g. tighten the contract example) rather than
retrying. Escalation path if both fail: the structural approach (citations
via `response_format`), which reverses the A.3 metadata-not-tool decision
and therefore needs its own proposal.

## Conformance to core architectural decisions

- **Composable (P1):** the retry is a branch inside the existing
  `groundedAnswerOverScope` seam after `verifiedCitations` — no new
  component; no new abstraction, so no second-caller test owed.
- **Done-able (P5):** closure = measured residual rate recorded here, plus
  (if built) a live probe showing the backstop recovering an omitted block.
- **One source of truth (P6):** no new types; funnel shape unchanged.
- **TDD (P2):** if built, starts with a failing test (scripted LLM omits the
  block on round 1, emits it on the retry → citations ship).
