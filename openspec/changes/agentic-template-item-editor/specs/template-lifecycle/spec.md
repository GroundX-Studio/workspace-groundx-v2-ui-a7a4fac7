## ADDED Requirements

### Requirement: Uncommitted draft templates are session-scoped, orthogonal to the committed lifecycle
A template being edited but not yet committed (an "uncommitted draft") SHALL use the same shared `Template` shape (`TemplateSaveInput`, with `name` nullable) and SHALL be persisted per chat session (the entity twin), NOT in the committed-Template store. It is session-scoped working state — distinct from a committed `Template` (scope-independent, owned, named, saved via the auth-gated save). Committing a draft (the "Save" action) produces a committed `Template`; the draft itself is never a committed Template and does not participate in committed-Template versioning/ownership.

#### Scenario: A draft is the uncommitted form of a Template
- **WHEN** a user edits a schema/report in the editor without committing
- **THEN** the working draft is stored as a `TemplateSaveInput`-shaped uncommitted Template on the session, with no owner/timestamps and a possibly-null name

#### Scenario: Committing a draft yields a committed Template
- **WHEN** a signed-in user clicks Save
- **THEN** the draft is committed into a persisted, owned, named `Template` via the existing save path, and the uncommitted draft state is no longer authoritative

#### Scenario: An anonymous draft persists without committing
- **WHEN** an anonymous user edits a schema and reloads
- **THEN** the uncommitted draft is restored from the session entity twin, even though no committed Template can be saved
