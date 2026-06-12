# Tasks — citation-retry-backstop

All SEQUENTIAL; gate = adversarial review against plan + real code.

- [ ] **T0 — Measure (the decision gate).** Pull `citationFunnel` log lines
  over a usage soak window; compute the rate of grounded content turns with
  zero shipped citations, split by cause (`emitted: 0` vs parse losses vs
  validation drops). Record the numbers HERE. If immaterial → close this
  change with the measurement; skip T1+.
  Gate: numbers recorded honestly; close-vs-build decision explicit.

- [ ] **T1 — Failing test first.** Scripted LLM omits the citations block on
  the content turn; the retry call returns the block; assert the reply ships
  the verified citations and exactly ONE retry request was made. RED.
  Gate: fails because no retry exists.

- [ ] **T2 — Implement the bounded retry** inside `groundedAnswerOverScope`
  (after `verifiedCitations`, rag/content turns with non-empty snippets
  only); funnel gains a `retried` marker. Full middleware suite green.
  Gate: T1 green; report + hybrid behavior byte-identical; latency added
  only on the miss path.

- [ ] **T3 — Live probe + closure.** Re-run the 6× tax probe + a product
  question (zero citations expected); update the spec delta if the retry
  changes the emission requirement's wording; `openspec validate --strict`.
