# Tasks — harden-citation-emission

ORDERING (re-reconciled 2026-06-12): `agentic-tool-loop` has LANDED — this
change lands ON TOP of the multi-round `callGroundedLlm` (see proposal
§Ordering). Re-diff the shared files (`ragPipeline.ts`, `groundedAnswer.ts`,
`prompts/fragments.ts`) at T1 start; the tree has moved twice during
planning.

Every task SEQUENTIAL. Gate = adversarial review against plan + real code
(falsify claims, open the test file, `npm run build` + middleware vitest
file-serial) before advancing.

- [x] **T1 — Failing user-visible tests first (RED).** In one commit, add the
  failing tests that pin the user-visible defect end-to-end:
  (a) `ragPipeline.test.ts` (or sibling): `parseGroundedAnswer` recovers
  citations from a one-line fence, a ```JSON fence, and a bare trailing
  `{"citations":…}` object (NOT CRLF — already green, verified 2026-06-12); dedupes identical entries merged from
  two blocks; preserves an untagged content fence in `cleanedAnswer`; (b) `prompts.test.ts`: the CONTRACT FRAGMENT
  (`citationsContract(...)` output, NOT the whole assembled system prompt —
  skill knowledge / tool notes may legitimately embed fences) contains the
  MUST-cite sentence and exactly ONE example fence with BOTH entry forms
  when extraction is present; (c) `groundedAnswer.test.ts`: a turn with
  one emitted entry dropped by value-mismatch surfaces
  `debug.citations = {emitted: 1, shipped: 0, dropReasons: {value: 1}}`.
  All RED for the right reasons (features absent, not typos).
  Gate: watch each fail; failure message names the missing behavior.

- [x] **T2 — U1 contract rewrite (GREEN for T1b).** Merge
  `EXTRACTION_CITATIONS_CONTRACT` into a single `citationsContract(hasExtraction)`
  builder in `fragments.ts`; MUST-cite wording; one example block; softened
  drop language; `grounded.ts` consumes it; delete the dead export.
  Gate: T1b green; `prompts.test.ts` + `promptLiterals.guard.test.ts` green;
  grep proves no other consumer of the deleted export; full suite green.

- [x] **T3 — U2 parser + completion hardening (GREEN for T1a).** On the
  landed multi-fence merge: tolerant fence pattern + bare-trailing-object
  fallback (metadata-key detection stays the strip criterion); dedup merged
  entries; coerce numeric-string `page`; parse-loss counters on the parse
  result. `callGroundedLlm` (multi-round since agentic-tool-loop):
  `max_completion_tokens: 4096` on EVERY round's request (in-repo precedent:
  summarizer; update the stale comment at `chatHandler.test.ts:1133`);
  per-round `finish_reason === "length"` warn; `truncated` flag tracks the
  FINAL round. NO temperature pin. Request-shape + finish_reason tests cover
  a multi-round scripted turn.
  Gate: T1a green; existing rag/report/hybrid + regression suites green
  (parser is shared — verify report + hybrid tests specifically); no body
  regression (cleaned answer unchanged for the canonical single-fence case);
  LIVE SMOKE: one real grounded call succeeds with
  `max_completion_tokens` (never ship a 400-ing param).

- [x] **T4 — U3 structural truncation.** Budget 12,000; drop whole trailing
  array items then trailing fields, then in-place string-value truncation
  for a lone oversized scalar (design §U3); always-valid-JSON prompt block
  with `_truncated` marker; warn log with sizes. Oversized + under-budget
  fixture tests (under-budget byte-identical). UPDATE the existing
  pathological-fixture assertion at `chatRouter.test.ts:942-957` (asserts the
  old `…(truncated)` literal + 20k single-scalar fixture) to the new marker.
  Gate: fixture block `JSON.parse`s; live sample (6,159 chars) now fits
  untruncated; validation still uses the full payload (test proves a citation
  to a field outside a truncated block still validates).

- [x] **T5 — U4 funnel observability (GREEN for T1c).** `verifiedCitations`
  reason counters (every silent drop point tagged — eight sites in
  `verifyExtractionCitation`, mapping per design §U4); merged funnel on
  `logger.info` + `_debug.citations` added to the shared
  `chatReplyDebugSchema` (`shared/src/index.ts` — NOT `chatRouterTypes.ts`;
  the closed Zod object strips unknown keys); omitted-vs-all-dropped
  distinguishable.
  Gate: T1c green; grep `return null` in `verifyExtractionCitation` — every
  one increments a reason; `_debug` stays dev-only (prod test asserts no
  `_debug` leak, existing behavior).

- [x] **T6 — Live emission probe + closure.** Run the live probe (6× tax
  question, real LLM + GroundX): record omitted/emitted/shipped in this file;
  expect ≥5/6 shipped. ALSO probe one NON-content question ("what is
  GroundX?") asserting ZERO citations — guards the no-invented-citations rule
  against MUST-cite over-compliance (design §Risks). Then `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1
  validate --all --strict --json` + both vitest suites + `npm run build`.
  Gate: probe results recorded honestly (a miss is a finding, not a failure
  to hide); if <5/6, open T-DEFER-1 immediately with the funnel data.

  **PROBE RESULTS (live, 2026-06-12, gpt-5.5 + real GroundX):**
  - Tax question ×6: **6/6 runs shipped citations** (pre-change baseline:
    ~40%). Five runs: emitted=6-7, shipped=all, zero drops. One run:
    emitted=4, parse=3, shipped=1 — the funnel surfaced a partial parse loss
    that was previously invisible (reply still carried a citation).
  - Product question ("what is GroundX?"): citations=0, emitted=0 — the
    MUST-cite contract did NOT induce invented citations on non-content
    turns (no-invented-citations rule holds).
  - Residual signal for T-DEFER-1: occasional arm-invalid entries
    (funnel `parse` reason) — measurable via the `citationFunnel` log line.

**T-DEFER-1 and T-DEFER-2 are CLOSED here — filed as active changes
(2026-06-12): `openspec/changes/citation-retry-backstop/` and
`openspec/changes/extraction-citation-geometry-miss-policy/`. Both are
measurement-gated (T0 first; close-with-data if the funnel says no).**
