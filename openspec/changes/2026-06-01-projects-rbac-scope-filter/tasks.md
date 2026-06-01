# Tasks — projects + RBAC as the app-owned filter layer behind ContentScope

> **Per-task adversarial-review gate (Discipline §10, principle 3).** Not done
> until a review against THIS plan AND real code passes, before marking done and
> before the next task: falsify against the RECORDED GroundX fixture (not the
> seam); no dead column / no FE dead stub (every persisted byte has a read site;
> every shared type has ≥1 consumer); shared types are ONE `@groundx/shared`
> Zod→infer (no twin, no `Record<string,unknown>`); `openspec validate --strict`;
> cross-plan collision check on `groundxSearch.ts`/`chatHandler.ts`/
> `mysqlRepository.ts`/`shared/src/index.ts`; middleware vitest file-serial +
> `npm run build` green. Failed gate → back to in-progress.
>
> SEQUENTIAL unless marked WORKFLOW.

## 0. De-risk the mechanism — SEQUENTIAL (BLOCKS everything)
- [ ] **0.1 Prove a clean flat `{projectId}` filter matches in GroundX search.**
      On a throwaway/test doc (or a temp copy), set a flat filter
      `{projectId:"proj_test", workflow_id:"…"}` via `document_update`, then
      `search_content(bucket, query, filter:{projectId:"proj_test"})` and confirm
      ≥1 result. Resolve WHY today's `{scenarioId:"utility"}` returns 0 even though
      the key is present (hypotheses: the nested `manifest` object breaks match;
      a `document_update` after ingest didn't re-index; filter values must be flat
      scalars). Record the finding. **If a flat filter does NOT match, STOP** and
      escalate the GroundX-side requirement — the whole plan assumes it does.
- [ ] **Adversarial review:** the match is shown against a REAL recorded GroundX
      response for the requested doc (filename/documentId match — guard the
      tool-result file-save artifact); the "why scenarioId failed" verdict is read
      off data, not assumed.

## 1. Reproduce the live failure — SEQUENTIAL
- [ ] **1.1 Capture fixtures** (no secrets): the failing `{projectId:utility}`
      search (count 0), the working no-filter search (6 results), `document_get`
      (the polluted filter), under `middleware/src/services/fixtures/`.
- [ ] **1.2 Failing test (red):** a middleware test replaying the fixtures asserts
      the CURRENT pipeline yields 0 usable snippets over the bucket+`projectId`
      scope.
- [ ] **Adversarial review:** red against current `runRagPipeline`, not stubbed.

## 2. App-owned schema — SEQUENTIAL
- [ ] **2.1 `projects` + `project_grants` tables** in `mysqlRepository.ts`
      (CREATE + the in-memory dev repo mirror): columns per the proposal. NO
      `accounts` table (principal = GroundX customerId). Repository methods:
      `getProject`, `listProjectsForBucket`, `insertProject`,
      `listGrantsForPrincipal(customerId|null)` (NULL → public only).
- [ ] **2.2 Drift guard:** extend the dead-column policy test — every grant/project
      column has a writer AND a reader (the resolver), or a tracked-keep reason.
- [ ] **Adversarial review:** no GroundX-owned concept duplicated (no customer/
      bucket mirror); columns round-trip; dev + MySQL repos agree (shape test).

## 3. Shared types — SEQUENTIAL (one Zod source)
- [ ] **3.1 `DocumentFilter`** Zod schema + `z.infer` in `@groundx/shared`
      (`{ projectId: string; workflow_id?: string }`), plus `Role` enum. Export
      a `stampDocumentFilter(project)` helper (pure) used by seed + BYO.
- [ ] **3.2 Confirm `ContentScope`/`ScopeFilter` need NO change** (projectId is
      already a valid `ScopeFilter` field) — assert via a type-level test; do NOT
      add a FE `Project`/grant type (no consumer → no dead stub).
- [ ] **Adversarial review:** `grep` proves no twin `DocumentFilter`/`Role` in
      app or middleware; the FE imports nothing new; `stampDocumentFilter` has its
      two callers named (seed now; BYO tracked).

## 4. RBAC resolution + RAG wiring — SEQUENTIAL
- [ ] **4.1 `authorizedProjectIds(caller)`** in the middleware (grant graph query;
      anon → public only). Unit-tested over the dev repo.
- [ ] **4.2 `compileRagFilter(caller, scope)`** — `authorized ∩ requested` →
      `rbacFilter {projectId:{$in:…}}`; empty → deny/empty. Wire it into the
      chat + report paths so `searchGroundX` receives it as `options.rbacFilter`
      (the existing `$and` seam). `deriveRagContentScope` keeps emitting
      `{filter:{projectId}}` resolved from the projects table.
- [ ] **4.3 Failing→green:** the Task-1.2 reproduction flips to a grounded, cited
      "amount due" answer once the seed (Task 5) + resolver are in place.
- [ ] **Adversarial review:** no forked search path (`grep` one
      `searchGroundX` caller shape); a 2nd user CANNOT read another's project
      (test: grant to user A, query as B → excluded); RBAC stays server-side
      (FE never receives grants).

## 5. Seed fix + sample project — SEQUENTIAL
- [ ] **5.1 Seed** one `projects` row (`is_sample`, samples bucket) + one
      `project_grants(public,viewer)` row; re-stamp the sample doc filter to flat
      `{projectId: proj_<sample>, workflow_id}` via `document_update` (drop the
      `manifest`/`scenarioId` pollution from the GroundX filter — the manifest
      moves to app-side scenario config if still needed).
- [ ] **5.2** Confirm the scope producer (`produceEntityScope`) resolves the
      sample entity → the real `proj_<sample>` id (not the `utility` slug).
- [ ] **Adversarial review:** the live sample doc filter is now flat + matches
      (re-run 0.1's search); the Extract widget's `workflow_id` read still works
      (filter still carries it).

## 6. Regression + closeout
- [ ] **6.1** Fold the `2026-06-01-rag-retrieval-correctness` ground-truth suite
      onto this fix (offline, recorded fixtures, no live network): each known-
      answerable query → grounded answer + ≥1 citation; "never silently
      no-snippets" tripwire; + an RBAC test (cross-user isolation).
- [ ] **6.2 Live re-verify (done = user-visible):** onboarding chat "amount due"
      returns a grounded citation; `_debug.groundx` shows the matched filter.
- [ ] **6.3** `openspec validate --strict`; middleware+app suites + drift guards +
      build green; update `docs/agents/data-model.md` (the new tables + shared
      types + the scope→filter→RBAC path) in this change.
- [ ] **Final adversarial review:** no dup data structure FE↔MW; no dead stub
      (every shared type consumed, every column read); durable spec updated;
      reconcile/withdraw the superseded parts of rag-retrieval-correctness.
- [ ] Archive.
