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

## 3. DocumentFilter type + stamp helper — SEQUENTIAL (one source; MIDDLEWARE, not @groundx/shared)
- [ ] **3.1 `DocumentFilter` type + `stampDocumentFilter(project)` helper in a
      single MIDDLEWARE module** (`{ projectId: string; workflow_id?: string }`).
      **Correction (found during execution):** NOT in `@groundx/shared` — the FE
      never stamps docs and never sees RBAC roles (it only builds a `ContentScope`),
      so a shared `DocumentFilter`/`Role` would be a dead stub in the FE package.
      `ProjectRole` already lives in middleware `types.ts` — keep it there. Build
      this WITH its first consumer (Task 5.3 seed-bucket stamp; BYO tracked).
- [ ] **3.2 Confirm `ContentScope`/`ScopeFilter` (the genuinely shared types)
      need NO change** — `projectId` is already a valid `ScopeFilter` field. Add
      NO new FE type (no consumer → no dead stub).
- [ ] **Adversarial review:** `grep` proves one `DocumentFilter` definition (no
      twin); the FE/`@groundx/shared` gain nothing; `stampDocumentFilter` has ≥1
      real caller (the seed) + BYO tracked.

## 4. RBAC resolution + RAG wiring — SEQUENTIAL ✅ DONE (4.3 deferred-tracked)
- [x] **4.1 `authorizedProjectIds(repo, username)`** in `services/projectAccess.ts`
      (from `listGrantsForPrincipal`; anon/null → public only). Unit-tested.
- [x] **4.2 `rbacFilterForProjects` → `options.rbacFilter`** wired into BOTH the
      chat route (`handleChatMessage` deps) and the report-render route
      (`renderReport` deps). `searchGroundX` composes it (`$and`) with the scope
      filter, so it INTERSECTS the requested scope (implicit deny on an
      unauthorized project; `{$in:[]}` denies all). Chose the existing seam over
      a JS-side intersect — no forked path. `deriveRagContentScope` unchanged.
- [x] **4.3 First `user`-grant writer — DEFERRED + TICKETED** (spawn_task
      2026-06-02: "Wire owner-grant writer + project-create/sharing flow"). No
      authed project-create flow exists yet (earn-the-axis); the `user`-grant
      RESOLVER branch is general + test-covered (`projectAccess.test.ts` cross-user
      isolation); the WRITER lands with that ticket. Tracked, NOT orphaned.
- [x] **4.4 Producer-mismatch test green** (Task 1.1 flipped by the producer fix);
      full LIVE re-verify of the chat answer is Task 6.2.
- [x] **Adversarial review:** `grep` — one `searchGroundX` composition path (no
      fork); cross-user isolation proven (grant to A, query as B → excluded; anon
      → public only); RBAC server-side (FE receives no grants); 709→713 suite
      green; the `user` branch is general/test-covered with its writer tracked.

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
- [x] **6.2 LIVE re-verify DONE (done=user-visible):** fresh onboarding session →
      "What is the total amount due on this bill?" → "$7,613.20 … Jul 30, 2025"
      with 2 citation chips + Show source (screenshot). Middleware log:
      `filter:{projectId:{$in:["proj_c7701da7-…"]}}` matched. DL-1 reverified.
- [x] **6.1 Ground-truth regression suite** — `services/ragCorrectness.regression.test.ts`
      (offline, fake clients, no live network): 3 Utility ground-truth pairs
      (amount-due/addressee/meter-count) each → grounded answer + ≥1 citation +
      non-ambient tier, plus a "never silently no-snippets" TRIPWIRE on the
      amount-due pair. Complements the producer-emits-UUID + RBAC isolation
      regressions (`entityScopeProducer.test` / `projectAccess.test`). 717 green.
- [ ] **6.2 Live re-verify (done = user-visible):** onboarding chat "amount due"
      returns a grounded citation; `_debug.groundx` shows the matched filter.
- [x] **6.3 (docs)** `docs/agents/data-model.md` updated (projects + project_grants
      tables row + the "New project/RBAC need" guidance + scope→filter→RBAC path);
      `docs/agents/groundx-real-api-shapes.md` gains the search-filter +
      `document_update`-re-ingest + verbosity-score operational facts; memory
      `project_projects_rbac_filter.md` written. Suites/build/validate green
      (re-run at final archive). Remaining: 6.1 broader fixture suite, Task 7.
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
