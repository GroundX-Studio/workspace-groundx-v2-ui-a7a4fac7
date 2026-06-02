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
>
> **STATUS (2026-06-02).** Task 0 DONE (de-risk PASSED). Task 2 DONE (tables +
> seed of the sample project). Task 1 RE-SCOPED (the GroundX filter bug is fixed
> server-side, so the live failure is now the producer mismatch, not 0-snippets).
> Naming reconciled to `username` (GroundX consistency); `principal_type` =
> `public|user` (account deferred). `rag-retrieval-correctness` WITHDRAWN
> (superseded; its regression suite lives in Task 6). Added Task 7
> (manifest/registry relocation) so the "no app metadata in the GroundX filter"
> requirement becomes truthful.

## 0. De-risk the mechanism — SEQUENTIAL ✅ DONE
- [x] **0.1 Proved filter matching works on the REAL doc.** After the GroundX
      server-side filter bug was fixed + stamping a `projectId`, the exact DL-1
      query "What is the total amount due on this bill?" with
      `filter:{projectId:"proj_c7701da7-…"}` returns count 12, score 210, answer
      `$ 7,613.20`. (Earlier `{scenarioId}`→0 was the now-fixed GroundX bug, NOT a
      flat-vs-nested issue.) Mechanism confirmed on live data.
- [x] **Adversarial review:** verified against the real recorded GroundX response
      for `c3bfff49` (fileName/documentId match); the verdict is read off the live
      count, not the code comment.

## 1. Reproduce the LIVE failure (re-scoped: producer mismatch) — SEQUENTIAL
- [ ] **1.1 Failing test (red):** the live failure is no longer 0-snippets-from-
      GroundX (the filter bug is fixed) — it is that `produceEntityScope` emits
      `projectIdsJson:["utility"]` (the slug) while the doc carries
      `projectId:"proj_c7701da7-…"`, so `deriveRagContentScope` →
      `{filter:{projectId:["utility"]}}` matches nothing. Add a middleware test
      asserting the producer/derive currently yields the slug (mismatch) — RED
      against current code.
- [ ] **Adversarial review:** red against the real `produceEntityScope` /
      `deriveRagContentScope`, not a stub; documents the slug↔UUID mismatch.

## 2. App-owned schema — SEQUENTIAL ✅ DONE
- [x] **2.1 `projects` + `project_grants` tables** in `mysqlRepository.ts` +
      in-memory mirror; `AppRepository` methods (`insertProject`/`getProject`/
      `listProjectsForBucket`/`insertProjectGrant`/`listGrantsForPrincipal`);
      record types. `principal_username` (GroundX username), `principal_type`
      `public|user`. NO accounts table; no GroundX concept duplicated.
- [x] **2.2 Drift guard:** both tables registered in `persistedColumnPolicy`
      (every column read by its mapper). Round-trip + seed-idempotency tests green.
- [x] **Adversarial review:** no GroundX-owned concept duplicated; columns
      round-trip; dev + MySQL repos mirror the same methods.

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
- [ ] **4.1 `authorizedProjectIds(username)`** in the middleware (from
      `listGrantsForPrincipal`; anon/null → public only). Unit-tested over the dev repo.
- [ ] **4.2 `compileRagFilter(caller, scope)`** — `authorized ∩ requested` →
      `rbacFilter {projectId:{$in:…}}`; empty → deny/empty. Wire it into the
      chat + report paths so `searchGroundX` receives it as `options.rbacFilter`
      (the existing `$and` seam). `deriveRagContentScope` keeps emitting
      `{filter:{projectId}}` resolved from the projects table.
- [ ] **4.3 First production writer of a `user` grant** (clears the dormant-
      plumbing flag): on authed project-create, write an `owner` grant for the
      creator's username. (Sharing-with-another-username endpoint/UI stays a
      tracked follow-up; the `user` branch must have ≥1 real writer here.)
- [ ] **4.4 Failing→green:** the Task-1.1 producer-mismatch test flips to a
      grounded, cited "amount due" answer once the producer (Task 5) + resolver
      are in place.
- [ ] **Adversarial review:** no forked search path (`grep` one
      `searchGroundX` caller shape); a 2nd username CANNOT read another's project
      (test: grant to user A, query as B → excluded); RBAC stays server-side
      (FE never receives grants); the `user`-grant branch has a real writer.

## 5. Producer + seed-script stamp — SEQUENTIAL (seed row already DONE in Task 2)
- [x] **5.1 Seed the sample project row + public grant** — DONE in `db/seedSampleProject.ts`
      (real UUID `proj_c7701da7-…`, idempotent on boot). Sample doc re-stamped with
      that UUID via `document_update` (manifest/scenarioId KEPT for now — the
      scenario registry still reads them off the filter; flattening is Task 7).
- [ ] **5.2 Wire the producer:** `produceEntityScope` resolves `sample:<scenarioId>`
      → the real `SAMPLE_PROJECT_ID` (look up the projects table / the sample
      mapping) instead of the `scenarioId` slug, so `deriveRagContentScope` emits
      `{filter:{projectId:"proj_c7701da7-…"}}` matching the live doc.
- [ ] **5.3 Codify the doc stamp in the seed-bucket script** — the seed must stamp
      `filter.projectId = SAMPLE_PROJECT_ID` (today it's a manual `document_update`;
      make it reproducible). Uses the shared `stampDocumentFilter` (Task 3).
- [ ] **Adversarial review:** producer emits the UUID (re-run the search live);
      Extract `workflow_id` read still works; the stamp is in the script, not manual.

## 6. Regression + closeout
- [ ] **6.1** Ground-truth regression suite (the surviving piece of the WITHDRAWN
      `rag-retrieval-correctness`): offline, recorded fixtures, no live network —
      each known-answerable query → grounded answer + ≥1 citation; "never silently
      no-snippets" tripwire; + an RBAC cross-user-isolation test.
- [ ] **6.2 Live re-verify (done = user-visible):** onboarding chat "amount due"
      returns a grounded citation; `_debug.groundx` shows the matched filter.
- [ ] **6.3** `openspec validate --strict`; middleware+app suites + drift guards +
      build green; update `docs/agents/data-model.md` (the new tables + shared
      types + the scope→filter→RBAC path) in this change.
- [ ] **Final adversarial review:** no dup data structure FE↔MW; no dead stub
      (every shared type consumed, every column read); durable spec updated;
      `rag-retrieval-correctness` withdrawn; e2e-audit DL-1 repointed here.

## 7. Manifest / registry relocation — SEQUENTIAL (makes the "no app metadata in the filter" requirement truthful)
- [ ] **7.1** The scenario registry (`middleware/src/scenarios/registry.ts`)
      currently builds the onboarding scenario list by reading `filter.kind`,
      `filter.scenarioId`, `filter.manifest` OFF the GroundX doc filter. Move that
      source app-side (a scenario config / the projects table) so the GroundX
      `filter` can drop the `manifest`/`scenarioId`/`kind` blob and become flat
      `{projectId, workflow_id}`.
- [ ] **7.2** Re-stamp the sample doc to the flat filter (via the seed script) once
      the registry no longer depends on the doc filter; confirm the onboarding
      picker still lists scenarios and search still matches `{projectId}`.
- [ ] **Adversarial review:** registry still returns scenarios from the new source;
      GroundX doc filter is flat; `search_content(filter:{projectId})` still matches.

- [ ] Archive.
