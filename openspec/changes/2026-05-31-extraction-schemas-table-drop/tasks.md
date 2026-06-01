# Tasks — Drop the superseded `extraction_schemas` table (soak-gated)

> **GATED — NOT READY.** The drop tasks below MUST NOT begin until BOTH gates clear (the first
> two tasks). This change was extracted from `2026-05-31-core-data-followups` §6 precisely so the
> rest of that epic could close without blocking on a production release boundary.
>
> **Execution: → SEQUENTIAL (deploy-gated).** Gates first, then the coupled drop under TDD, then
> closeout. Never a workflow fan-out.

## Gates (must both clear before any drop task)

- [ ] **GATE 1 — UNBLOCK (soak):** Confirm the `templates` migration has been LIVE in production
      for one full release AND a code sweep (`grep -rn extraction_schemas middleware/src`) shows
      ZERO readers/writers of `extraction_schemas` remain — only the dormant
      `CREATE TABLE IF NOT EXISTS extraction_schemas` and the copy `INSERT…SELECT … FROM
      extraction_schemas` in `mysqlRepository.ts` may still reference it. Only after this passes
      may the drop tasks below begin.
- [ ] **GATE 2 — SEQUENCING (after the audit):** Confirm `2026-05-31-e2e-experience-audit` has
      PASSED. Per the program plan it is the last functional gate before any DB-shape change; do
      not touch the persistence tier ahead of it.

## Drop (gated on BOTH gates above) · TDD

- [ ] **Failing-first test:** Re-target the migration test in
      `middleware/src/db/mysqlRepository.test.ts` to assert a fresh boot + `createSchema()`
      succeed with the table gone — the emitted statements contain NO
      `CREATE TABLE IF NOT EXISTS extraction_schemas` and NO copy `INSERT…SELECT … FROM
      extraction_schemas`, with the statement count and the remaining `templates`/viewer
      assertions updated. RED while the CREATE/INSERT still exist in `mysqlRepository.ts`.
- [ ] **Remove the copy-migration:** Delete the `INSERT INTO templates … SELECT … FROM
      extraction_schemas … ON DUPLICATE KEY UPDATE id = id` block (`mysqlRepository.ts` ~line 276)
      — it reads the table being dropped; leaving it breaks `createSchema`/startup.
- [ ] **Remove the orphan CREATE:** Delete the now-unreferenced
      `CREATE TABLE IF NOT EXISTS extraction_schemas` DDL (`mysqlRepository.ts` ~line 234) and the
      stale "left intact (deprecated; dropped in a later sweep)" comments that pointed at this
      sweep.
- [ ] **Drop the table:** Add the `DROP TABLE IF EXISTS extraction_schemas` migration step so an
      already-provisioned production database sheds the superseded table on the next boot
      (idempotent; safe on a DB where it was never created).
- [ ] **Test GREEN:** the re-targeted migration test passes — fresh boot + `createSchema()` succeed
      with the table gone.

## Closeout

**Execution: → SEQUENTIAL (gate).** A single serial gate, never a workflow.

- [ ] Migration test green; `scaffold/middleware` suite green (run with `--no-file-parallelism`
      per the file-serial config) and `scaffold/app` suite green.
- [ ] `npm run build` (app + middleware) green; widget-contract + no-hardcoded-styles +
      tool-quality drift guards green.
- [ ] `openspec validate 2026-05-31-extraction-schemas-table-drop --strict` green; no delta vs
      shipped/archived specs beyond this change's intended one.
- [ ] Update `docs/agents/data-model.md` to drop `extraction_schemas` from the persistence facts
      table (it no longer exists).
- [ ] Archive.
