# Tasks — validate-agentic-loop-live-model

DONE 2026-06-15 — the live-model validation procedure exists as a runnable, out-of-suite
smoke and was run against live LLM + GroundX; outcome PASS (recorded below).

- [x] **T1 — The validation IS the live run** (discipline §1: verify behaviour, not the
  seam). `middleware/scripts/validate-agentic-loop.ts` drives `groundedAnswerOverScope`
  with the real tool catalog + `maxRounds:4` against live clients. The FIRST run failed
  ONE case — but that exposed a wrong EXPECTATION, not a model bug: a product Q whose
  injected skill block covers it correctly REFRAINS from lookup. Expectations corrected
  to the spec's two halves (calls-when-uninjected / refrains-when-covered).
- [x] **T2 — Procedure + recorded outcome.** Run:
  `UPSTREAM_TIMEOUT_MS=120000 npm --workspace middleware exec tsx scripts/validate-agentic-loop.ts`
  (NOT a vitest test → the default suite stays LLM-free). LIVE OUTCOME (2026-06-15, gpt-5.5):
  - (1) PRODUCT, no injection → CALLS `lookup_groundx_docs` (1–2 rounds); PRODUCT,
    planner-injected & covered → REFRAINS (no lookup); DOCUMENT Qs → never call lookup.
    ✅ both halves of requirement (1).
  - (2) maxRounds(4) exhausted on 0/5 turns (max 2 used) → budget healthy. ✅
  - (3) Skill retrieval is relevant enough that the loop self-corrects (the "file types"
    Q got an off-target first block → the model did a 2nd lookup round). ✅
  - SUMMARY: 0 asserted mismatches → RESULT: PASS.
- [x] **T3 — Adversarial review; `validate --strict`; suites green; archive.**
