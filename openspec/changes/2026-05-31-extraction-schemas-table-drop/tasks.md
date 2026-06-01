# Tasks — Drop the superseded `extraction_schemas` table (soak-gated)

> TDD: failing test first, then implement, then adversarial review before marking done.
> **Adversarial review gate after EVERY task (Discipline §10)** — a task is not `[x]` until an
> adversarial review of its output against the plan AND the real code passes, run before marking
> done and before the next task.

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
- [ ] **Adversarial review:** the gate evidence must be REAL, not asserted. Re-run
      `grep -rn extraction_schemas middleware/src` yourself and read EVERY hit — confirm the only
      survivors are the dormant `CREATE TABLE IF NOT EXISTS extraction_schemas` DDL and the copy
      `INSERT…SELECT … FROM extraction_schemas` in `mysqlRepository.ts` (plus comments); any
      reader/writer in a service, route, or query path means the soak is NOT complete → gate stays
      `[ ]`. Independently confirm the `templates` migration shipped and has been live one full
      release (deploy tag / release record), not merely merged — a merged-but-unreleased migration
      does not satisfy the soak.
- [ ] **GATE 2 — SEQUENCING (after the audit):** Confirm `2026-05-31-e2e-experience-audit` has
      PASSED. Per the program plan it is the last functional gate before any DB-shape change; do
      not touch the persistence tier ahead of it.
- [ ] **Adversarial review:** confirm the audit PASS is real, not anticipated — the
      `2026-05-31-e2e-experience-audit` change is actually archived/closed with a passing record,
      not still in-progress. If it has not closed, this gate stays `[ ]` and no drop task begins.

## Drop (gated on BOTH gates above) · TDD

- [ ] **Failing-first test:** Re-target the migration test in
      `middleware/src/db/mysqlRepository.test.ts` to assert a fresh boot + `createSchema()`
      succeed with the table gone — the emitted statements contain NO
      `CREATE TABLE IF NOT EXISTS extraction_schemas` and NO copy `INSERT…SELECT … FROM
      extraction_schemas`, with the statement count and the remaining `templates`/viewer
      assertions updated. RED while the CREATE/INSERT still exist in `mysqlRepository.ts`.
- [ ] **Adversarial review:** open the test and run it — confirm it is genuinely RED right now
      against the UNCHANGED `mysqlRepository.ts` (the CREATE + INSERT still present), not green-by-
      construction. The RED must come from the new no-`CREATE`/no-`INSERT…SELECT` assertions firing
      against real emitted statements (not a hand-edited statement count), and the test must assert
      `createSchema()` + a fresh boot SUCCEED with the table gone — so it will fire RED again if ANY
      of the three (table, copy-INSERT, orphan CREATE) survives the removals below.
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
- [ ] **Adversarial review:** all three must be removed/added TOGETHER — a partial sweep is the
      failure mode. Run `grep -rn extraction_schemas middleware/src` and confirm the ONLY surviving
      hit is the new `DROP TABLE IF EXISTS extraction_schemas` step: zero `CREATE TABLE` for it,
      zero `INSERT…SELECT … FROM extraction_schemas`, and the stale "dropped in a later sweep"
      comments are gone. Confirm the DROP is sequenced AFTER the (now-removed) copy so no statement
      references a table it just dropped, and that it is idempotent (`IF EXISTS`) so a never-
      provisioned DB still boots.
- [ ] **Test GREEN:** the re-targeted migration test passes — fresh boot + `createSchema()` succeed
      with the table gone.
- [ ] **Adversarial review:** confirm GREEN is earned by the code change, not by retargeting the
      test — re-introducing ANY one of the three (table CREATE, copy-INSERT, orphan CREATE) turns it
      RED again. Spot-check by mentally (or via a throwaway local revert) reinstating the orphan
      CREATE and confirming the assertion would fail; the test must not have been weakened to merely
      assert presence of the DROP.

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
- [ ] **Adversarial review of the WHOLE change against the plan AND the real code:** both gates'
      evidence was real (one full release soaked; audit closed); `grep -rn extraction_schemas
      middleware/src` shows ONLY the `DROP TABLE IF EXISTS` step survives — table CREATE, copy
      INSERT…SELECT, and stale comments are ALL gone together; the migration test is genuinely green
      and would fire RED if any of the three returned; `data-model.md` no longer lists the table.
      Only then archive.
- [ ] Archive.
