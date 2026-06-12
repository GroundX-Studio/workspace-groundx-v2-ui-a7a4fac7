# Tasks — extraction-citation-geometry-miss-policy

All SEQUENTIAL; gate = adversarial review against plan + real code.

- [ ] **T0 — Measure (the decision gate).** Pull `citationFunnel` lines over
  a usage soak; compute the share of extraction citations dropped with
  `dropReasons.geometry` despite passing validation. Record HERE. If rare →
  close this change with the measurement; skip T1+.
  Gate: numbers recorded honestly.

- [ ] **T1 — User decision.** Present the data + options (keep drop /
  chip-only citation / rejected page-1 fallback) to the user. Record the
  decision HERE. If "keep" → close.
  Gate: decision is the user's, not inferred.

- [ ] **T2 — Spec MODIFIED delta FIRST.** Rewrite the "no pageless citation
  form" clauses of the claim-level-citations requirement in this change's
  delta per the decision; `openspec validate --strict` green BEFORE any code.
  Gate: durable-spec conflict check against other active changes.

- [ ] **T3 — Failing test, then implement.** Validated extraction entry +
  unresolvable geometry → the decided behavior (e.g. chip-only citation).
  Includes the FE render path for a citation without a highlight target.
  Gate: RED watched; middleware + app suites green; funnel `geometry`
  reason re-pointed or retained per the decision.
