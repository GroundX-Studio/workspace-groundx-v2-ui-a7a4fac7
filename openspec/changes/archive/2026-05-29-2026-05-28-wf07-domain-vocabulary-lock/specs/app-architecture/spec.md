# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: The GroundX ↔ product domain vocabulary SHALL be fixed and single-sourced

The product↔GroundX resource mapping SHALL be authoritative and singular: a product **Workspace
is exactly one GroundX bucket** (1:1); a product **project, portfolio, fund, or folder is a filter
field on documents** within that bucket (resolved as a GroundX `filter`, e.g. `{ projectId }`), NOT
a separate GroundX resource; and a GroundX **group is reserved solely for cross-bucket (cross-workspace)
search**. No surface SHALL model a single-workspace project view as a GroundX group, and no surface
SHALL treat the Partner `/workspace/*` scaffold-project facade as the customer document workspace.
Existence of a bucket SHALL be inferred from a document's `bucketId` (e.g. via `document_get`), not
from `bucket_get`, which can deny access under a partner/cross-customer credential context even for a
real bucket.

#### Scenario: Project resolves to a filter, not a group

- **GIVEN** a product "project view" scoped to one workspace
- **WHEN** its `ContentScope` is resolved to a GroundX request
- **THEN** it is a `bucket` target plus a `filter` on the project field
- **AND** it is NOT a GroundX `group`.

#### Scenario: Group is only cross-bucket

- **GIVEN** a scope that spans more than one bucket
- **WHEN** it is resolved to a GroundX request
- **THEN** a GroundX `group` MAY be used (e.g. the multi-bucket pivot helper)
- **AND** single-bucket scopes never resolve to a group.
