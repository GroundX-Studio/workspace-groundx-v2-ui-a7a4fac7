# Spec Delta — template-lifecycle (NEW capability)

The durable home for the shared **Template** — the question/field artifact that both the Extract
schema and the Report template are instances of. Consolidates the Template bullets previously split
across `core-data-model-hardening` and `smart-report` Phase 2.

## ADDED Requirements

### Requirement: A Template SHALL be the one shared, scope-independent, versioned question artifact

A Template SHALL be the single durable artifact underlying BOTH Extract schemas and Report templates:
an ordered set of question/field items, scope-independent, named, and updatable. A Template
SHALL carry `id`, `kind` (`extract` | `report`), `name`, `ownerUsername`, and a
`kind`-discriminated `body`. (A row is "versioned" by being updatable via upsert on its
client-minted `id`; an explicit version counter / history is deferred until a consumer needs it.)
The Extract schema and the Report template SHALL be two `kind` instances
of this one concept, sharing types, persistence, and lifecycle — NOT forked parallel implementations.
The Template SHALL carry no scope; scope is supplied at render/extract time as a `ContentScope`.

#### Scenario: Extract and Report share one Template lifecycle

- **GIVEN** an `extract`-kind Template and a `report`-kind Template
- **WHEN** their create / save / persistence / editing-overlay paths are inspected
- **THEN** they resolve to the same shared types, table, and lifecycle code
- **AND** neither is a forked duplicate of the other.

#### Scenario: A Template is scope-independent

- **GIVEN** a saved Template
- **WHEN** it is applied to extract or render
- **THEN** the `ContentScope` is supplied at that call, not stored on the Template
- **AND** the same Template applies over different scopes unchanged.

### Requirement: The Template wire contract SHALL live in the shared package

The Template wire shape SHALL be defined once in `@groundx/shared` as a Zod schema with the type
derived via `z.infer` (schema-as-source-of-truth), consistent with `Citation` and `ContentScope`. A
`parseTemplate` sanitizer SHALL validate the Template at the DB-read and wire boundaries, dropping
malformed input rather than casting unchecked. Server-side validation SHALL cover the **envelope**
(`id`, `kind`, `name`, `ownerUsername`) and the **body container** (the kind's top-level array) but
NOT individual field/section internals — preserving the existing opaque-body coupling so a
frontend-only field-shape change does not require a middleware change. Both the app and the
middleware SHALL import this one definition.

#### Scenario: One Template definition across the boundary

- **GIVEN** the app save path and the middleware persistence path
- **WHEN** the Template type each uses is resolved
- **THEN** both resolve to the `@groundx/shared` Template schema
- **AND** the persisted `body_json` is validated (envelope + container) by `parseTemplate` on read, not as-cast
- **AND** a new field/section-level property does NOT require changing the server schema.

### Requirement: Extract SHALL migrate onto the shared Template with no behavior change

Extract SHALL be migrated onto the shared Template lifecycle BEFORE Report is built on it, and the
migration SHALL preserve all existing Extract behavior. The durable store SHALL be a `templates`
table (with a `kind` column); existing `extraction_schemas` rows SHALL be copy-migrated into it
as `kind='extract'` by an idempotent migration that leaves the legacy table intact. The save path
SHALL remain gated on an authenticated user (anonymous callers receive 401 and the "sign in to save"
affordance), unchanged.

#### Scenario: Extract behavior is preserved through the migration

- **GIVEN** the Extract schema save / load / edit flows
- **WHEN** they run against the shared Template lifecycle after migration
- **THEN** the full Extract test suite passes with no behavior change
- **AND** an authenticated save persists a `kind='extract'` Template; an anonymous save returns 401.

#### Scenario: Existing schemas are preserved by an idempotent copy-migration

- **GIVEN** an existing `extraction_schemas` row
- **WHEN** the `templates` migration runs (and re-runs)
- **THEN** the row is present in `templates` as `kind='extract'` exactly once
- **AND** the original `extraction_schemas` row is left untouched.

### Requirement: Template ownership SHALL be server-assigned, never client-supplied

A Template's owner SHALL be assigned by the server from the authenticated session, and the save wire
contract SHALL NOT accept an owner from the client. The save input SHALL carry only `{id, kind, name,
body}`; the server SHALL set `ownerUsername` from `session.groundxUsername` and stamp the timestamps,
ignoring any owner-bearing field in the request body. This preserves the existing safe behavior (the
Extract save already derives the username from the session) and prevents an authenticated user from
writing a Template owned by another user.

#### Scenario: A save is owned by the session, not the body

- **GIVEN** an authenticated session for user A
- **WHEN** a Template is saved with a body that attempts to assert a different owner
- **THEN** the persisted Template's `ownerUsername` is user A (from the session)
- **AND** the client-supplied owner field is ignored.
