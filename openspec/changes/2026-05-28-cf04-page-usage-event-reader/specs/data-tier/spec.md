# Spec Delta — data-tier

## ADDED Requirements

### Requirement: The middleware SHALL persist page-usage events to a dedicated table

A new MySQL table `page_usage_event` SHALL record every billable
page event (ingestion, extraction, reingest) for downstream
aggregation. The table SHALL carry: `id` (uuid), `user_id` (FK-ish
to the `groundx_username` column on `chat_sessions`), `pages_billed`
(positive integer), `event_kind` (one of `ingest` / `extract` /
`reingest`), `entity_key` (the chat-session entity the pages
attached to), `timestamp_ms` (BIGINT for UTC millis),
`event_json` (TEXT payload). The table SHALL carry an index on
`(user_id, timestamp_ms)` so the monthly aggregate query is O(log n)
on the user's events.

The repository interface (`AppRepository`) SHALL expose:

- `appendPageUsageEvent(record): Promise<void>`
- `sumPagesThisMonthForUser(userId, monthStartMs): Promise<number>`

Both methods SHALL be mirrored in the memory repository for tests.
The memory implementation SHALL maintain a `byUser` secondary index
so the aggregate query stays O(events-for-user) rather than O(all-events).

#### Scenario: Aggregation respects the month boundary

- **GIVEN** the table contains 3 events for user `alice@example.com`:
  20 pages on 2026-04-30, 15 pages on 2026-05-01, 12 pages on 2026-05-15
- **WHEN** `sumPagesThisMonthForUser("alice@example.com", startOfMay2026Utc)` runs
- **THEN** the returned sum is 27 (the April event is excluded)

#### Scenario: Empty result is a valid zero

- **GIVEN** the table is empty for user `alice@example.com`
- **WHEN** the aggregate query runs
- **THEN** the result is `0`, not `null` or an error.
