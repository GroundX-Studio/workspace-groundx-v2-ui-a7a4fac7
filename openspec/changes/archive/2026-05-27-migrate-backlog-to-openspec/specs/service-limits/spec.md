# Spec Delta — service-limits

Migrated from `backlog.md` Epic SL (active rows only).

## ADDED Requirements

### Requirement: Widget-search concurrency SHALL be capped at 3 per session

Per `memory/project_security.md`, the middleware SHALL cap concurrent
widget-driven search calls (`extraction-workbench`, `chat-with-sources`,
etc.) at ≤3 per chat session. Excess concurrent requests SHALL queue
and resolve in arrival order.

#### Scenario: 5 concurrent searches → 3 run, 2 wait

- **GIVEN** an authed session
- **WHEN** the client fires 5 concurrent widget search calls
- **THEN** at most 3 hit GroundX at the same time
- **AND** the remaining 2 wait for a slot before dispatching
