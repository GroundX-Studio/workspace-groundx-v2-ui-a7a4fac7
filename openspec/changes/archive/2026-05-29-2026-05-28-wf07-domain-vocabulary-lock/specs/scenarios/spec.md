# Spec Delta — scenarios

## ADDED Requirements

### Requirement: Solar ContentScope SHALL use bucket + project filter, not a group

The Solar scenario's content scope SHALL resolve a project view to the Solar workspace bucket plus a
`projectId` filter, and a portfolio view to the bucket itself (bucket-wide) — correcting the earlier
"project view = group" mapping. The Solar workspace is one GroundX bucket holding all Solar
documents; the Portfolio → Fund → Project hierarchy is expressed as document filter fields, not as
separate buckets or groups. A GroundX group SHALL NOT be used for a single-workspace Solar view.

#### Scenario: Solar project view scopes by filter

- **GIVEN** the Solar scenario with a selected project
- **WHEN** the chat/search content scope is built
- **THEN** the scope is `{ type: "bucket", bucketId: <solar workspace> }` with a `projectId` filter
- **AND** no GroundX group is created or referenced for that view.

#### Scenario: Solar portfolio view is bucket-wide

- **GIVEN** the Solar scenario at the portfolio level
- **WHEN** the content scope is built
- **THEN** the scope targets the Solar workspace bucket (optionally filtered by portfolio)
- **AND** it is not a group.
