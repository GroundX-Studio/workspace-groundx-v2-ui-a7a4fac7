## MODIFIED Requirements

### Requirement: ContentScope SHALL translate to a GroundX search filter intersected with the caller's authorized projects

Every RAG/search/report query SHALL be built from a shared `ContentScope` whose
`filter` carries app organizational fields using the canonical GroundX document
filter vocabulary, including `projectId` for product project scope. The
middleware SHALL compile this scope filter to a GroundX search filter composed
with an RBAC filter derived from the caller's grants —
`{projectId: {$in: authorizedProjectIds(caller)}}` — so a caller can never read
a project they hold no grant on. RBAC resolution SHALL be server-side only; the
frontend SHALL NOT receive the grant graph and SHALL build only a `ContentScope`.

#### Scenario: Project scope uses projectId

- **GIVEN** the frontend opens a product project within a workspace bucket
- **WHEN** it builds the `ContentScope`
- **THEN** the scope is `{type:"bucket", bucketId, filter:{projectId}}`
- **AND** it does not use `filter.project`.

#### Scenario: Cross-user isolation through the filter

- **GIVEN** `proj_a` granted `user/owner` to username A and a document in it
  stamped `{projectId:"proj_a"}`
- **WHEN** username B (no grant on `proj_a`) issues a chat/search whose scope
  requests `proj_a`
- **THEN** `compileRagFilter` intersects B's authorized set (which excludes
  `proj_a`) and the search returns no documents from `proj_a`.

### Requirement: ScenarioConfig SHALL expose the resolved projectId used for sample document filters

The shared `ScenarioConfig` returned by `GET /api/scenarios` SHALL include a
required `projectId` field. The middleware scenario registry SHALL resolve this
field from the same mapping used by sample project seeding and entity scope
production, so the frontend can build `ContentScope.filter.projectId` without
duplicating middleware-only mapping constants.

#### Scenario: Utility scenario carries its real project id

- **GIVEN** the Utility sample document is stamped with
  `filter.projectId = "proj_c7701da7-0e08-482a-a496-df9dfe991613"`
- **WHEN** `GET /api/scenarios` returns the Utility `ScenarioConfig`
- **THEN** `ScenarioConfig.projectId` is
  `"proj_c7701da7-0e08-482a-a496-df9dfe991613"`
- **AND** the app uses that value for `/projects` scoping.

