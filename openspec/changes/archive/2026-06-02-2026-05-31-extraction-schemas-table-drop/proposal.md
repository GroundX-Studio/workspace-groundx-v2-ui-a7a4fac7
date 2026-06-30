# Drop the superseded `extraction_schemas` table (soak-gated)

## Why

The `shared-template-lifecycle` Phase 2 work introduced the `templates` table and an
idempotent boot copy-migration (`INSERT…SELECT … FROM extraction_schemas`) that folds the
legacy saved Extract schemas into `templates` as `kind='extract'`. The Phase-3 cutover then
removed every reader/writer of the old `extraction_schemas` table — but the table itself,
its `CREATE TABLE IF NOT EXISTS`, and the copy-migration that reads it were deliberately
LEFT IN PLACE (`mysqlRepository.ts` line ~234 CREATE, ~276 INSERT…SELECT), to be dropped in
a later soak-gated sweep. This change is that sweep. It was extracted from
`2026-05-31-core-data-followups` §6 so the rest of that epic could close without waiting on a
production release boundary.

This change MUST NOT begin until BOTH gates below clear. They are encoded as the FIRST tasks.

- **GATE 1 — SOAK (unblock):** The `templates` migration must have been LIVE in production for
  one full release AND a code sweep must show ZERO readers/writers of `extraction_schemas`
  remain (the Phase-3 cutover removed them; only the dormant CREATE + copy-INSERT touch it).
  Dropping the table before the replacement has soaked one release would strand any in-flight
  rows that had not yet been copied into `templates`. The drop tasks are gated on this.
- **GATE 2 — SEQUENCING (after the audit):** Per the program plan, this change runs AFTER
  `2026-05-31-e2e-experience-audit` has passed. That audit is the last functional gate before
  any DB-shape change; touching the persistence tier ahead of it would invalidate the audit's
  baseline. Confirmation that the audit has passed is the second of the first tasks.

The drop is coupled: the table and the boot copy-migration that READS it must go together. The
copy `INSERT…SELECT … FROM extraction_schemas` runs inside `createSchema()` on every boot; if
the table is dropped but the INSERT is left, the next boot's `createSchema` (and therefore
startup) breaks against the missing table. So this change drops the table, removes the
copy-migration, and removes the now-orphan `CREATE TABLE IF NOT EXISTS extraction_schemas` — in
the same change.

## What Changes

Only after BOTH gates clear:

- Drop the `extraction_schemas` table (the data has soaked into `templates` for one release).
- Remove the boot copy-migration `INSERT…SELECT … FROM extraction_schemas` in
  `middleware/src/db/mysqlRepository.ts` (it reads the dropped table; leaving it breaks
  `createSchema`/startup).
- Remove the now-orphan `CREATE TABLE IF NOT EXISTS extraction_schemas` (line ~234) and the
  stale "left intact (deprecated; dropped in a later sweep)" comments that pointed here.
- **Failing-first:** the migration test in `middleware/src/db/mysqlRepository.test.ts` currently
  asserts the `extraction_schemas` CREATE + the copy `INSERT…SELECT` are emitted by
  `createSchema()` and expects 13 statements. Re-target it (RED while the table/INSERT/CREATE
  remain) to assert a fresh boot + `createSchema()` succeed with the table gone — no
  `extraction_schemas` CREATE, no copy-INSERT, the statement count and remaining
  `templates`/viewer assertions updated — GREEN after the removals land.

This change touches `middleware/src/db/mysqlRepository.ts` (DDL + copy-migration removal) and
its test only. It introduces one durable requirement in the `data-tier` capability that
codifies the soak-then-drop discipline so future superseded tables follow the same gate.
