# Tasks — authed project-create + share grant

Each task names its execution kind (all SEQUENTIAL here — one shared file
`app.ts` + one service file, no parallel-safe fan-out) and its adversarial
review gate (principle 3). A task does not advance until its gate passes against
the plan AND the real code.

## T1 — Failing user-visible test FIRST (SEQUENTIAL)

- [x] `app.test.ts`: `POST /api/projects` as an authed customer → 201, the
      project + an `owner` user-grant are persisted, and `authorizedProjectIds`
      for the creator now includes the new project (the RBAC read round-trip).
      Anon → 401; bad body → 400.
- [x] `app.test.ts`: `POST /api/projects/:id/grants` — owner shares with another
      username at `viewer` → 201, grant persisted, **the sharee's
      `authorizedProjectIds` now includes the project**; non-owner → 403;
      self-share → 400; unknown target username → 404; unknown project → 404.
- [x] `projectAccess.test.ts`: `createProjectWithOwner` writes project + owner
      grant; `roleOnProject` returns `owner` for the creator, `null` for others;
      `writeUserGrant` inserts a `user` grant.
- **Gate:** tests exist, are RED for the right reason (routes/functions absent),
  open the test file to confirm they assert the round-trip not a seam.

## T2 — Service writers (SEQUENTIAL)

- [x] Add to `services/projectAccess.ts`: `newProjectId()`,
      `createProjectWithOwner(repo, {name, bucketId, ownerUsername})`,
      `writeUserGrant(repo, {projectId, principalUsername, role})` (shared by the
      owner-grant path + the share path — the earned second caller),
      `roleOnProject(repo, username, projectId)`.
- **Gate:** `projectAccess.test.ts` green; functions are pure repo-only (no HTTP,
  no partner client); `createProjectWithOwner` uses `writeUserGrant` (no dup).

## T3 — Routes (SEQUENTIAL)

- [x] `app.ts`: `POST /api/projects` + `POST /api/projects/:projectId/grants`
      (gated `requireAuthenticatedUser`, `apiLimiter`), inline parse helpers,
      Partner `getCustomer` target validation (404 `principal_not_found` on
      upstream 404), owner check BEFORE target validation (no username-existence
      probing by non-owners), inline `toProjectView`/`toGrantView` projections.
- **Gate:** `app.test.ts` green; verify `/api/projects` does NOT collide with the
  `/api/project` (singular) Partner proxy `app.use` (segment-boundary); 201/400/
  401/403/404 shapes match the error envelope `{ error }`.

## T4 — Test double (SEQUENTIAL)

- [x] Extend `FakePartnerClient` with a `missingCustomers` set so `getCustomer`
      throws `UpstreamHttpError(…, 404)` for an unknown username (legit
      test-double, not mock-mode).
- **Gate:** the unknown-target 404 test drives this; no production code depends
  on it.

## T5 — Docs + spec delta + suite green (SEQUENTIAL)

- [x] `specs/data-tier/spec.md` delta: ADD the project-create + share writer
      requirement (scenarios mirror T1).
- [x] `docs/agents/data-model.md`: note the writer endpoints under the
      projects + grants section.
- [x] `npm run build` + full middleware vitest green; `openspec validate
      --strict`.
- **Gate:** adversarial review — falsify each claim against code; confirm no
  dormant plumbing; confirm the inline `TODO`/ticket for T6 exists.

## T6 — DEFERRED ticket (NOT built in this change)

- [ ] BYO document upload + `filter.projectId` stamping via
      `stampDocumentFilter`. No app-owned ingest endpoint exists today; building
      stamp wiring with no caller would be dormant plumbing. Spin up when the BYO
      upload UI/endpoint lands. Seam: `services/documentFilter.ts`
      `stampDocumentFilter` + `scripts/seed-bucket.ts`'s stamp usage as the
      precedent.
