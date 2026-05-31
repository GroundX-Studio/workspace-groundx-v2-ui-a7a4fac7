# Spec Delta — data-tier (deferred DB sweep)

The soak-gated removal of the legacy `extraction_schemas` table, re-homed from the archived
`2026-05-29-shared-template-lifecycle` change. SOAK-GATED — not ready until the `templates` migration
has soaked one release in production.

## ADDED Requirements

### Requirement: The legacy extraction_schemas table SHALL be dropped after the templates migration soaks

The data tier SHALL remove the legacy `extraction_schemas` table, its boot copy-migration
`INSERT…SELECT … FROM extraction_schemas`, and its orphan `CREATE TABLE IF NOT EXISTS extraction_schemas`
together — but only after the `templates` migration has soaked one release in production and a code
sweep confirms zero readers/writers of `extraction_schemas` remain — so that a fresh boot and
`createSchema` succeed with the table gone.

#### Scenario: The drop waits for the soak gate

- **GIVEN** the `templates` migration that supersedes `extraction_schemas`
- **WHEN** the drop is considered
- **THEN** it proceeds only after the migration has soaked one release AND no code reads or writes
  `extraction_schemas`.

#### Scenario: Boot and createSchema succeed with the table gone

- **GIVEN** the `extraction_schemas` table, its copy-migration, and its `CREATE TABLE` are removed in one change
- **WHEN** the application boots and `createSchema` runs against a database without that table
- **THEN** boot and `createSchema` succeed (no reader of the dropped table remains).
