# Spec Delta — service-limits

## ADDED Requirements

### Requirement: The chat router SHALL surface live page-usage for authenticated users asking pages-remaining

The middleware SHALL query the `page_usage_event` table for the
user's sum of `pages_billed` since the start of the current UTC
month whenever the user asks a `pages-remaining`-shaped question
(routed via `structuredHandler.answerPagesRemaining`). The aggregate
MUST be included in the answer copy as
`"X of <byoPagesLimit> pages used"`.

Anonymous sessions (no `groundxUsername`) SHALL receive the static
budget copy without a usage count. The reader MUST NOT block the
answer when the table is empty; an empty aggregate is a valid
"0 pages used" result.

#### Scenario: Authenticated user — usage count appears in the answer

- **GIVEN** the user is authenticated as `alice@example.com` and the
  `page_usage_event` table has 47 pages billed this month for that user
- **WHEN** the user asks "how many pages remaining on my plan?"
- **THEN** the chat reply answer contains the substring `"47 of 100"`
  (or `"47 of <byoPagesLimit>"` for whatever the configured cap is)
- **AND** no client-visible TODO copy surfaces.

#### Scenario: Anonymous user — usage count omitted

- **GIVEN** the session has no `groundxUsername`
- **WHEN** the user asks "how many pages remaining on my plan?"
- **THEN** the answer surfaces the budget cap only, without a live
  count
- **AND** no error is logged.
