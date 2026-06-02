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
- [x] **5.2 Producer wired** — `produceEntityScope` resolves `sample:<scenarioId>`
      → the real `SAMPLE_PROJECT_ID` via `SAMPLE_PROJECT_ID_BY_SCENARIO` (commit
      11cad62), so `deriveRagContentScope` emits `{filter:{projectId:"proj_c7701…"}}`.
- [x] **5.3 Doc stamp codified in `scripts/seed-bucket.ts`** — stamps
      `filter.projectId` reproducibly (ingest + existing-doc reconcile; commit
      801cd50). NOTE: the flat `DocumentFilter`/`stampDocumentFilter` helper is the
      flat-filter end-state → moved to `2026-06-02-flatten-document-filter` (the
      projectId stamp shipped additively via `sampleDocFilterSchema.projectId`).
- [x] **Adversarial review:** producer emits the UUID (live search → count 12);
      Extract `workflow_id` still works; the stamp is in the script, not manual.

## 6. Regression + closeout
- [x] **6.1 Ground-truth regression suite** — `services/ragCorrectness.regression.test.ts`
      (offline, fake clients, no live network): 3 Utility ground-truth pairs each →
      grounded answer + ≥1 citation + non-ambient tier, plus a "never silently
      no-snippets" TRIPWIRE. Complements producer/RBAC regressions. 717 green.
- [x] **6.2 LIVE re-verify DONE (done=user-visible):** fresh onboarding session →
      "$7,613.20 … Jul 30, 2025" with 2 citation chips + Show source (screenshot).
      Middleware log: `filter:{projectId:{$in:["proj_c7701da7-…"]}}` matched.
      DL-1 reverified in the e2e-audit defect log.
- [x] **6.3 (docs)** `docs/agents/data-model.md` + `groundx-real-api-shapes.md`
      updated; memory `project_projects_rbac_filter.md` written.
- [x] **Final adversarial review:** spec reconciled to shipped code (username;
      `public|user`; projectId stamped additively — flat filter split to the
      follow-up); no dup/dead-stub; every column read; `rag-retrieval-correctness`
      withdrawn; e2e-audit DL-1 repointed here. Suites 717 + build + `--strict` green.

## 7. Manifest/registry relocation → MOVED to `2026-06-02-flatten-document-filter`
- [x] Split out (Option A, 2026-06-02): the manifest/registry relocation + the flat
      `{projectId, workflow_id}` filter + the `DocumentFilter`/`stampDocumentFilter`
      helper are tracked in `2026-06-02-flatten-document-filter` (cosmetic cleanup
      that rewrites the live onboarding registry — safer as its own scoped change;
      the additive filter works today). projects-rbac is functionally complete.

- [x] **Archive** — Tasks 0–6 done; 4.3 ticketed; Task 7 split to
      `2026-06-02-flatten-document-filter`. The DL-1 fix + RBAC layer are complete,
      tested (717 green), live-verified, and shipped.
