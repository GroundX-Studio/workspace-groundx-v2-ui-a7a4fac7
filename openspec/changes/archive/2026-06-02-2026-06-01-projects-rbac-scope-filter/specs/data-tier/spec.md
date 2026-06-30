# data-tier — app-owned projects + RBAC filter layer (delta)

## ADDED Requirements

### Requirement: App "projects" + RBAC grants SHALL be the only net-new MySQL tables, never duplicating GroundX-owned concepts

The app SHALL persist a `projects` table (the WF-07 filter-value grouping of
documents within a bucket) and a `project_grants` table (the RBAC/ACL graph over
those projects) in MySQL, and SHALL NOT create MySQL tables that mirror
GroundX-owned concepts (customer identity, buckets, groups, documents, Partner
Projects, workflows). A customer is referenced by its GroundX **username**
(consistent with the existing `groundx_username` columns); a grant `principal`
is `public` or a `user` (that username). Team/org (`account`) grouping of
multiple customers is out of scope until a real consumer exists (earn-the-axis),
so `principal_type` is `public | user` only.

#### Scenario: A project carries an owner and grants, referencing GroundX usernames

- **GIVEN** a `projects` row `{project_id:"proj_x", bucket_id, owner_username}`
  and a `project_grants` row `{project_id:"proj_x", principal_type:"user",
  principal_username:<username>, role:"owner"}`
- **WHEN** the repository is inspected
- **THEN** no MySQL table stores a copy of the GroundX customer, bucket, or
  document record — only the app-owned `project_id` ↔ `bucket_id` ↔
  `owner_username` references and the grant rows

### Requirement: ContentScope SHALL translate to a GroundX search filter intersected with the caller's authorized projects

Every RAG/search/report query SHALL be built from a shared `ContentScope` whose
`filter` carries app organizational fields (e.g. `projectId`), and the middleware
SHALL compile it to a GroundX search filter composed (`$and`) with an RBAC filter
derived from the caller's grants — `{projectId: {$in: authorizedProjectIds(caller)}}`
— so a caller can never read a project they hold no grant on. RBAC resolution
SHALL be server-side only; the frontend SHALL NOT receive the grant graph and
SHALL build only a `ContentScope`.

#### Scenario: Cross-user isolation through the filter

- **GIVEN** `proj_a` granted `user/owner` to username A and a document in it
  stamped `{projectId:"proj_a"}`
- **WHEN** username B (no grant on `proj_a`) issues a chat/search whose scope
  requests `proj_a`
- **THEN** `compileRagFilter` intersects B's authorized set (which excludes
  `proj_a`) and the search returns no documents from `proj_a`

#### Scenario: Public sample reachable by everyone

- **GIVEN** the sample project with a `project_grants(public, viewer)` row and its
  doc stamped `{projectId: proj_sample, workflow_id}`
- **WHEN** an anonymous onboarding caller asks "the total amount due"
- **THEN** `authorizedProjectIds` includes `proj_sample`, the compiled filter
  `{projectId: proj_sample}` matches the doc, and the answer is grounded with a
  citation

### Requirement: Every sample document's GroundX filter SHALL carry the project id, stamped reproducibly by the seed

The seed (`scripts/seed-bucket.ts`) SHALL stamp `filter.projectId` — the real
`proj_<uuid>` resolved from the scenario via `SAMPLE_PROJECT_ID_BY_SCENARIO`
(matching `produceEntityScope`, one source of truth) — on every sample document,
on ingest AND by reconciling already-seeded docs, so the scope→GroundX-filter
path matches without a manual `document_update`. (Flattening the filter — moving
the scenario `manifest`/`scenarioId` app-side so the GroundX filter becomes just
`{projectId, workflow_id}` — is the tracked follow-up
`2026-06-02-flatten-document-filter`; until then the projectId is added
ADDITIVELY alongside the existing manifest the scenario registry still reads.)

#### Scenario: Seeded sample doc's filter carries the matchable project id

- **GIVEN** the seed runs against the samples bucket
- **WHEN** a sample document is stamped
- **THEN** its GroundX `filter.projectId` is the scenario's real `proj_<uuid>`,
  and `search_content(filter:{projectId:"proj_<uuid>"})` returns that document
