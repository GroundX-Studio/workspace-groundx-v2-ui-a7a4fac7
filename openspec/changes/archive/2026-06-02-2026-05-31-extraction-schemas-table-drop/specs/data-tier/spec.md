# Spec Delta — data-tier (superseded tables drop only after a soak)

## ADDED Requirements

### Requirement: Superseded persistence tables SHALL be dropped only after a soak and zero remaining readers/writers

A superseded persistence table SHALL be dropped only after its replacement has soaked one full
production release AND a code sweep shows zero readers/writers of the superseded table remain. The
drop SHALL be coupled with the removal of any boot-time copy-migration that reads the superseded
table and any now-orphan `CREATE TABLE` for it, in the same change, so that `createSchema()` and
startup keep succeeding after the table is gone. A migration test SHALL confirm a fresh boot +
`createSchema()` succeed with the table absent.

#### Scenario: A superseded table is dropped after it has soaked one release

- **GIVEN** the `extraction_schemas` table has been superseded by `templates`
- **AND** the `templates` migration has been live in production for one full release
- **AND** a code sweep shows no non-test reader/writer of `extraction_schemas` remains
- **WHEN** this change drops `extraction_schemas`
- **THEN** the same change removes the boot copy-migration `INSERT…SELECT … FROM extraction_schemas`
- **AND** removes the now-orphan `CREATE TABLE IF NOT EXISTS extraction_schemas`

#### Scenario: A fresh boot succeeds with the dropped table gone

- **GIVEN** a fresh MySQL database with no `extraction_schemas` table
- **WHEN** the middleware boots and runs `createSchema()`
- **THEN** `createSchema()` completes without error
- **AND** the emitted DDL contains no `CREATE TABLE IF NOT EXISTS extraction_schemas`
- **AND** no copy-migration reads `extraction_schemas`

#### Scenario: The drop is blocked until both gates clear

- **GIVEN** either the `templates` migration has NOT yet soaked one production release
- **OR** the sequencing audit (`2026-05-31-e2e-experience-audit`) has NOT yet passed
- **WHEN** the drop is considered
- **THEN** the drop SHALL NOT proceed until both the soak gate and the audit gate have cleared
