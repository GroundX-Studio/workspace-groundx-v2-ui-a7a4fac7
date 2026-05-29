# CF-04: page_usage_event reader for BYO free-tier budget

## Why

`middleware/src/services/structuredHandler.ts:120` has a
`TODO(CF-04)` marker. The `answerPagesRemaining` handler runs when the
user asks "how many pages remaining on my plan?" (or similar). Today
it returns the static budget cap (`byoPagesLimit`) plus a frank note:

> Your BYO free-tier budget is 100 pages per month. I don't have the
> live usage count wired yet — once page-usage telemetry is queryable
> I'll show "X of 100 pages used."

The full answer requires:

1. A `page_usage_event` table that records every ingested-page
   billable event (per user, per ingestion).
2. A repository method that aggregates pages-this-month for a given
   user id.
3. Wiring that aggregator into `answerPagesRemaining`.

Today the chat router can't tell the user where they are in the
billing cycle, which weakens the entire "BYO budget" story.

## What changes

- ADD a `page_usage_event` table to `middleware/src/db/mysqlRepository.ts`'s
  schema (and a matching shape in the memory repository for tests).
  Columns: `id`, `user_id`, `pages_billed`, `event_kind`
  ("ingest" / "extract" / "reingest"), `entity_key`, `timestamp_ms`,
  `event_json`. Indexed on `(user_id, timestamp_ms)` for the
  windowed aggregate query.
- ADD an `appendPageUsageEvent(record)` repository method invoked
  from every code path that bills pages (ingestion completion is the
  current path; extraction may add more later).
- ADD a `sumPagesThisMonthForUser(userId, monthStart)` reader. Month
  boundary uses UTC, matches the existing `byoPagesLimit` reset
  cadence.
- WIRE the reader into `answerPagesRemaining`: when the user is
  authenticated, surface "X of `byoPagesLimit` pages used"
  in the answer copy. Anonymous users get the existing copy
  (no user_id → no aggregate).
- UPDATE the structured-handler test fixture with a mocked
  repository that returns a known aggregate; assert the answer copy.

## Out of scope

- The actual *page billing* hook (i.e., who calls
  `appendPageUsageEvent` and when). That's a follow-up tied to the
  ingestion pipeline; this change ships the table + reader.
- Per-bucket / per-group breakdowns of usage. Today's question is
  about the user-level monthly cap; finer-grained views can land later.
- Overage handling. When `pages_used >= byoPagesLimit` the chat just
  surfaces the number; the gating behavior (block ingest / prompt
  upgrade) is a separate concern.

## Affected

- Middleware: `db/mysqlRepository.ts` (schema + new method),
  `db/memoryRepository.ts` (mirror), `types.ts`
  (`PageUsageEventRecord`, repository interface), `services/structuredHandler.ts`
  (`answerPagesRemaining`), `services/structuredHandler.test.ts`
  (new fixture).
- Specs: `service-limits` (BYO budget query requirement),
  `data-tier` (page_usage_event schema).
