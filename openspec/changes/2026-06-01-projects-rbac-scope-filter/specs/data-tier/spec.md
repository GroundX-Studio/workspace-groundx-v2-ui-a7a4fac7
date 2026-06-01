# data-tier — app-owned projects + RBAC filter layer (delta)

## ADDED Requirements

### Requirement: App "projects" + RBAC grants SHALL be the only net-new MySQL tables, never duplicating GroundX-owned concepts

The app SHALL persist a `projects` table (the WF-07 filter-value grouping of
documents within a bucket) and a `project_grants` table (the RBAC/ACL graph over
those projects) in MySQL, and SHALL NOT create MySQL tables that mirror
GroundX-owned concepts (customer identity, buckets, groups, documents, Partner
Projects, workflows). An authenticated account is referenced by its GroundX
customer id (`session.ownerUserId`); a grant `principal` is that customer id or
`public`. Team/org grouping of multiple customers is out of scope until a real
consumer exists.

#### Scenario: A project carries an owner and grants, referencing GroundX ids

- **GIVEN** a `projects` row `{project_id:"proj_x", bucket_id, owner_customer_id}`
  and a `project_grants` row `{project_id:"proj_x", principal_type:"user",
  principal_id:<customerId>, role:"owner"}`
- **WHEN** the repository is inspected
- **THEN** no MySQL table stores a copy of the GroundX customer, bucket, or
  document record — only the app-owned `project_id` ↔ `bucket_id` ↔
  `owner_customer_id` references and the grant rows

### Requirement: ContentScope SHALL translate to a GroundX search filter intersected with the caller's authorized projects

Every RAG/search/report query SHALL be built from a shared `ContentScope` whose
`filter` carries app organizational fields (e.g. `projectId`), and the middleware
SHALL compile it to a GroundX search filter composed (`$and`) with an RBAC filter
derived from the caller's grants — `{projectId: {$in: authorizedProjectIds(caller)}}`
— so a caller can never read a project they hold no grant on. RBAC resolution
SHALL be server-side only; the frontend SHALL NOT receive the grant graph and
SHALL build only a `ContentScope`.

#### Scenario: Cross-user isolation through the filter

- **GIVEN** `proj_a` granted `user/owner` to customer A and a document in it
  stamped `{projectId:"proj_a"}`
- **WHEN** customer B (no grant on `proj_a`) issues a chat/search whose scope
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

### Requirement: The document filter SHALL be a shared flat structure stamped at upload

The filter stamped on every uploaded document SHALL be a single shared
`@groundx/shared` `DocumentFilter` Zod type — a flat, GroundX-matchable map
`{ projectId: string; workflow_id?: string }` — applied by both the seed and the
BYO-upload path via one shared `stampDocumentFilter` helper. App/UI metadata
(scenario manifest, etc.) SHALL NOT be stored in the GroundX document filter.

#### Scenario: Seeded sample doc carries a flat, matchable filter

- **GIVEN** the seed runs against the samples bucket
- **WHEN** a sample document is stamped
- **THEN** its GroundX `filter` is `{projectId: "proj_<sample>", workflow_id:"…"}`
  with no nested `manifest`/`scenarioId` blob, and a
  `search_content(filter:{projectId:"proj_<sample>"})` returns that document
