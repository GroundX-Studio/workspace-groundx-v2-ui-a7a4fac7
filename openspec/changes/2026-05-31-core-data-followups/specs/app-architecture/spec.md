# Spec Delta — app-architecture (core data-model hardening: remaining refactors)

Durable structural contracts for the still-open hardening items. Behavior-preserving; each lands
behind green tests with no user-visible regression.

## ADDED Requirements

### Requirement: API errors SHALL extend a single ApiError base

The application SHALL define one base `ApiError extends Error` carrying `status` and `detail`, and
every hand-rolled API/upstream error SHALL extend it rather than declaring its own status/detail
fields. A drift guard SHALL fail if a `*Error` class does not extend the base.

#### Scenario: An error class extends the shared base

- **GIVEN** an API or upstream error (e.g. `ExtractFieldApiError`, `ChatHandlerError`, `UpstreamTimeoutError`)
- **WHEN** an instance is constructed
- **THEN** it is `instanceof ApiError` (and `instanceof Error`) and exposes `status` and `detail`
- **AND** it does not declare its own duplicate `status`/`detail` fields.

#### Scenario: A non-conforming error fails the drift guard

- **GIVEN** a `*Error` class that does not extend `ApiError`
- **WHEN** the drift guard runs
- **THEN** the guard fails loudly, naming the offending class.

### Requirement: Entity CRUD SHALL be built from a shared factory over a discriminated SdkActionResult

Entity list/create/get/update/delete clients and their contexts SHALL be produced by a shared
`createEntityClient<T>()` / `createEntityContext<T>()` factory over an `SdkActionResult<T>`
discriminated union, so the hand-rolled per-entity duplication is removed and the success/error limbo
is unrepresentable.

#### Scenario: SdkActionResult makes the limbo state unrepresentable

- **GIVEN** the `SdkActionResult<T>` union (`{isSuccess:true;response:T} | {isSuccess:false;error}`)
- **WHEN** a value with `{ isSuccess: false; response: null; error: null }` is written
- **THEN** it fails type-checking
- **AND** narrowing on `isSuccess` exposes exactly `response` (true) or `error` (false).

#### Scenario: Entity wrappers and contexts use the factory

- **GIVEN** an entity surface (Buckets/Documents/Groups/Projects/Workflows/ApiKeys/Search/Health)
- **WHEN** its client and context are constructed
- **THEN** they are produced by `createEntityClient<T>()` / `createEntityContext<T>()`
- **AND** no hand-rolled CRUD wrapper or context remains off the factory.

### Requirement: App↔middleware wire twins SHALL derive from one shared module with a description-level drift guard

Wire types shared across the app↔middleware boundary SHALL be defined once in `@groundx/shared` and
imported by both sides — including the `/api/chat/*` envelope, `AppUserMetadata`, the event-source
enum, the page-dimension shape, and the field-type union — and the tool-catalog drift guard SHALL
assert NAME + DESCRIPTION parity, not merely the name set.

#### Scenario: A wire twin is defined once

- **GIVEN** a type that crosses the app↔middleware boundary (e.g. the chat envelope, `AppUserMetadata`)
- **WHEN** both sides reference it
- **THEN** both import the single `@groundx/shared` definition rather than hand-mirroring it.

#### Scenario: A drifted tool description fails the guard

- **GIVEN** a tool whose app-side description differs from its middleware `SERVER_TOOL_CATALOG` description
- **WHEN** the tool-catalog drift guard runs
- **THEN** the guard fails on the description mismatch, not only on a name-set mismatch.

### Requirement: Persisted columns and untrusted boundaries SHALL be validated into their typed shapes

Union-typed DB columns SHALL be validated in their row→object mappers, and untrusted JSON boundaries
(localStorage rehydration, `current_intent_json`) SHALL be validated against a shared schema, so a
corrupt value is rejected or coerced rather than cast straight into application or LLM context.

#### Scenario: A corrupt union column does not flow through unchecked

- **GIVEN** a row with an out-of-union `role`/`action`/`source` value
- **WHEN** it is read through the row→object mapper
- **THEN** the value is rejected or coerced, not blind-cast into the in-memory object.

#### Scenario: An untrusted CanvasIntent is validated against the shared schema

- **GIVEN** a `current_intent_json` value read from the DB or a rehydrated localStorage snapshot
- **WHEN** it is loaded
- **THEN** it is validated against the shared `canvasIntentSchema` (and rejected to a safe default if invalid).

### Requirement: Orchestrator dispatch SHALL be exhaustive over the CanvasIntent union

The orchestrator's `dispatch()` SHALL switch over `intent.kind` with a `never` exhaustiveness check so a
new `CanvasIntent` kind without a handler fails type-checking, and the retired `registerAdapter`
mechanism (zero non-test callers) SHALL be removed.

#### Scenario: A new intent kind fails type-check

- **GIVEN** a new `CanvasIntent` kind added to the union with no `dispatch` handler
- **WHEN** the project is type-checked
- **THEN** the `never` exhaustiveness assertion fails (rather than the dispatch silently no-opping).

### Requirement: Session auth state SHALL be a discriminated union, not an empty-string sentinel

Session authentication state SHALL be modeled as `{kind:"anon"} | {kind:"authed";groundxUsername;groundxApiKey}`
so the authed-vs-anonymous distinction is the discriminant, replacing the empty-string `groundxUsername`
sentinel and its scattered empty-string checks.

#### Scenario: Anonymous and authed sessions are distinguished by kind

- **GIVEN** a session
- **WHEN** its auth state is read
- **THEN** it is either `{kind:"anon"}` or `{kind:"authed";groundxUsername;groundxApiKey}`
- **AND** no empty-string `groundxUsername` is used as the anonymous sentinel.

### Requirement: Structural debt SHALL be guarded against recurrence

Drift guards SHALL fail loudly on the recurring debt classes this hardening removed: a viewer widget
not built on the `ScopedViewerWidget` base or lacking a `show_*` tool, a duplicate exported type name
across files, a `Record<string,unknown>` placeholder in a context's typed state, a `*Error` not
extending the `ApiError` base, and a persisted DB column with no in-memory type field. A cross-layer
reconciliation matrix in `docs/agents/data-model.md` SHALL assert app type · wire type · DB column ·
persisted JSON agreement.

#### Scenario: A reintroduced placeholder fails a guard

- **GIVEN** a context whose typed state reintroduces a `Record<string,unknown>` placeholder
- **WHEN** the placeholder drift guard runs
- **THEN** the guard fails, naming the offending context.

#### Scenario: A persisted column without an in-memory field fails a guard

- **GIVEN** a DB column that is written but has no corresponding in-memory type field
- **WHEN** the persisted-column drift guard runs
- **THEN** the guard fails, naming the column (the `citations_json`/`tool_calls_json`/`attachments_json` class).
