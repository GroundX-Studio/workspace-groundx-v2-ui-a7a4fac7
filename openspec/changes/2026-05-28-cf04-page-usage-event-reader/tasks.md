# Tasks — CF-04 page_usage_event reader

> **STATUS: BACKLOGGED (2026-05-30)** — not in the active run set. Do not start until reprioritized.

## Schema

- [ ] **Failing test:** `mysqlRepository.test.ts` — asserts the
      `page_usage_event` table exists in the schema string with the
      expected columns + index.
- [ ] Add the `CREATE TABLE IF NOT EXISTS page_usage_event` DDL to
      `middleware/src/db/mysqlRepository.ts` (alongside the
      existing `intent_log` / `viewer_events` DDL).
- [ ] Mirror the table shape in `memoryRepository.ts` (Map keyed
      by `id`, with secondary index `byUser` for the aggregate
      query).
- [ ] Add `PageUsageEventRecord` interface to `types.ts`.

## Repository methods

- [ ] **Failing test:** `memoryRepository.test.ts` — appends 3
      events for one user across two months; aggregate over the
      current-month boundary returns only this month's events.
- [ ] Add `appendPageUsageEvent(record)` to `AppRepository`
      interface + both implementations.
- [ ] Add `sumPagesThisMonthForUser(userId, monthStartMs)` to
      `AppRepository` + both implementations.
- [ ] Same tests against `mysqlRepository.test.ts` (schema-shape
      assertions; the in-memory aggregate test covers behavior).

## Handler wiring

- [ ] **Failing test:** `structuredHandler.test.ts` — when the
      user is authenticated AND the repository returns 47 pages
      used, `answerPagesRemaining` returns copy containing
      `"47 of 100"` (or whatever the byoPagesLimit is).
- [ ] **Failing test:** anonymous user → the existing
      `"don't have the live usage count wired"` copy still surfaces
      (no user_id means no aggregate).
- [ ] In `structuredHandler.answerPagesRemaining`: if
      `deps.groundxUsername` is present, call
      `repository.sumPagesThisMonthForUser(groundxUsername, startOfMonthUtc())`
      and inject `"X of Y pages used"` into the answer.
- [ ] Delete the `TODO(CF-04)` comment + the "I don't have the
      live usage count wired yet" copy when the authed branch fires.

## Closure

- [ ] App tests + middleware tests green.
- [ ] OpenSpec `validate --all --strict` passes.
- [ ] Archive the change.
