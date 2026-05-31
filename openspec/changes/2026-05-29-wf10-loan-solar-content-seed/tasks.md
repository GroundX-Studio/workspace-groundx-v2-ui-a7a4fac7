# Tasks — WF-10 Loan + Solar content seed

> **STATUS: BACKLOGGED (2026-05-30)** — not in the active run set; do not start until reprioritized.
> **BLOCKED ON SOURCE ASSETS (2026-05-29).** Needs real Loan packet PDFs (~12) + Solar portfolio
> PDFs (~142 or a subset) + their extraction workflows. These aren't in the repo and can't be
> fabricated without reintroducing fake content. Awaiting the user to provide the source PDFs (and
> confirm whether to reuse/author workflows for loan/solar). The seed scaffolding + JSON authoring
> is ready to go the moment the assets land. Skipped in the live-data sweep; not a deferral of
> in-reach work.

> **Execution mode: → SEQUENTIAL (data-ops, gated).** A linear seed pipeline (source → ingest → author
> JSON → tag → verify), and currently BLOCKED on assets — not code fan-out, so not a workflow. The only
> parallelizable slice is bulk per-doc ingest/tagging of the ~142 Solar docs once assets land; that's a
> scripted data job (`seed-bucket.ts` loop), not a subagent workflow.

- [ ] Source real Loan packet PDFs (12 docs) + Solar portfolio PDFs (142 docs, or a representative subset).
- [ ] Ingest with **layout/full processLevel** (so search returns `boundingBoxes`/`pages` + X-Ray exists).
- [ ] Author `scripts/scenarios/loan.json` + `solar.json` (slim manifest: `hero`/`thinkingScript`/`chatSeeds`).
- [ ] Solar: tag docs with Portfolio → Fund → Project **filter fields** (project = filter, not a group — WF-07).
- [ ] Attach per-doc `filter.workflow_id` so the Extract widget resolves a real schema.
- [ ] **Failing test:** `/api/scenarios` returns three scenarios, each with real `documentId`s (not placeholders).
- [ ] F1 picker surfaces all three; selecting Loan/Solar loads real docs (no empty/broken canvas).
- [ ] Suites green; OpenSpec validate; live check each scenario.
- [ ] Archive.
