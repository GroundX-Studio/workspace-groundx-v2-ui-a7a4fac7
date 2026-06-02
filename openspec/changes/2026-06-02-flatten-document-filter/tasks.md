# Tasks — flatten the GroundX document filter

> Per-task adversarial-review gate (Discipline §10). SEQUENTIAL. Touches the
> LIVE onboarding scenario registry — verify the picker stays populated.

## 1. Registry reads manifests app-side
- [x] **1.1 Failing test:** the scenario registry lists scenarios from the
      app-side scenario JSON configs and resolves each scenario's documents from
      the bucket by matching `filter.projectId` (NOT `filter.scenarioId`). RED
      against the current GroundX-filter-reading registry.
- [x] **1.2 Rewrite `scenarios/registry.ts`:** manifest ← JSON configs; documents
      ← bucket docs joined by `projectId` (inverse of `SAMPLE_PROJECT_ID_BY_SCENARIO`).
- [x] **Adversarial review:** onboarding picker still lists every seeded scenario;
      `grep` proves no remaining reader of `filter.manifest`/`filter.scenarioId`/
      `filter.kind`; the join is by projectId.

## 2. Flat DocumentFilter + stamp
- [x] **2.1** `DocumentFilter` type + `stampDocumentFilter(project)` helper
      (middleware module; NOT `@groundx/shared` — no FE consumer). Seed uses it.
- [x] **2.2** Drop `manifest`/`scenarioId`/`kind` from the seeded doc filter →
      flat `{projectId, workflow_id}`. Live re-stamp the sample doc
      (`document_update` → POLL `document_get` to `complete`).
- [x] **Adversarial review:** the live doc filter is flat; `search_content(
      filter:{projectId})` still matches; Extract `workflow_id` still read.

## 3. Closeout
- [x] Live re-verify: onboarding picker lists scenarios; chat answers "amount
      due" with a citation (unchanged).
- [x] `openspec validate --strict`; middleware + app suites + drift guards +
      build green; update `docs/agents` (registry source + flat filter).
- [x] **Final review** + archive.
