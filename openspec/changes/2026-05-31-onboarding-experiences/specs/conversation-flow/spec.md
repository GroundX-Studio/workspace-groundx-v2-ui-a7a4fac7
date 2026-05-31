# Spec Delta — conversation-flow (Workspace/Project experiences + enabled nav entries)

Two new directed experiences as catalog VALUES on the existing axis, the authenticated nav entries that
open them, and the retirement of SchemaView's manifest fallback so live extract is the sole path.

## ADDED Requirements

### Requirement: Workspace and Project SHALL be ChatExperience values, not flow forks

The Workspace and Project chat surfaces SHALL be expressed as `ChatExperience` factories
(`makeWorkspaceExperience({ scope })`, `makeProjectExperience({ scope })`) that close over a
`@groundx/shared` `ContentScope` and are registered in `chatExperienceRegistry` as glob-discovered
`experience` entries with ids `workspace` and `project`. They SHALL reuse the one `useConversation`
engine and the one `ConversationFlow` view; no new flow component and no flow `mode` SHALL be
introduced. A Workspace's scope SHALL be the `bucket` scope; a Project's scope SHALL be a scope whose
`filter` field/value identifies the project within a bucket.

#### Scenario: A new directed experience is added by composition only

- **GIVEN** the shipped `useConversation` engine, `ConversationFlow` view, and `chatExperienceRegistry`
- **WHEN** the Workspace experience is added
- **THEN** it is a `makeWorkspaceExperience({ scope })` factory closing over a `ContentScope`, exported
  as a `ChatExperienceEntry` with id `workspace` and discovered by the registry glob
- **AND** no new conversation flow component and no flow `mode` is introduced
- **AND** the Project experience is the same shape with id `project`, its scope carrying the project `filter`.

#### Scenario: The catalog resolves both experiences and validates their config

- **GIVEN** the `chatExperienceRegistry` data catalog
- **WHEN** `byId("workspace")` and `byId("project")` are read
- **THEN** each resolves to its entry with a `configSchema` that parses a `ContentScope` and rejects a non-scope arg
- **AND** `create(scope)` returns a `ChatExperience` whose pieces match the decided Intro/Choreography
- **AND** the catalog is used for lookup/enumeration only — the mounting surface supplies the scope and composes the result.

### Requirement: The Workspaces and Projects nav entries SHALL open their scoped conversations

The authenticated `OnboardingNav` Workspaces and Projects entries SHALL be enabled (not `aria-disabled`)
and SHALL open a surface that mounts `ConversationFlow` composed with the looked-up Workspace / Project
experience. The `/workspaces` and `/projects` routes those entries target SHALL be registered so neither
404s. Each entry SHALL resolve a distinct, stable `chat_sessions` row for its scope (ensure-created if
absent) so re-opening an entry returns to its own conversation. Logged-out users SHALL still see the
entries disabled with the "Sign in to use" affordance.

#### Scenario: An authenticated user opens the Workspace conversation

- **GIVEN** an authenticated user on a surface that renders `OnboardingNav` (non-`loggedOut`)
- **WHEN** they click the Workspaces entry
- **THEN** the `/workspaces` route mounts `ConversationFlow` composed with
  `chatExperienceRegistry.byId("workspace").create(<workspace scope>)`
- **AND** the conversation uses the Workspace entry's own `chat_sessions` row (re-opening returns to it)
- **AND** the Projects entry behaves identically with the `project` experience and its own session.

#### Scenario: The nav targets resolve and gate on auth

- **GIVEN** the nav entries' navigation targets `/workspaces` and `/projects`
- **WHEN** an authenticated user activates either
- **THEN** the route is registered and the scoped conversation mounts (no 404)
- **AND** for a logged-out user both entries remain disabled with `aria-disabled` and the "Sign in to use" title.

### Requirement: SchemaView SHALL read the live extract as its sole source

`SchemaView` SHALL render from the live extraction schema/values only; it SHALL NOT fall back to
`scenario.manifest.extractionSchema` or `scenario.manifest.sampleExtractionValues`. When live data is
absent, `SchemaView` SHALL surface the real empty/error state rather than stale manifest fixtures, and
its `data-extraction-status` SHALL reflect the live state, not a `"manifest"` default.

#### Scenario: No live data surfaces the real state, not the manifest

- **GIVEN** a scenario whose live extraction schema/values are unavailable
- **WHEN** `SchemaView` renders
- **THEN** it shows the empty/error ("live extract unavailable") state
- **AND** it does NOT read `scenario.manifest.extractionSchema` or `scenario.manifest.sampleExtractionValues`
- **AND** `data-extraction-status` reflects the live extraction state rather than `"manifest"`.
