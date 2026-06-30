# testing-suite Specification (delta)

## MODIFIED Requirements

### Requirement: Browser smoke + a11y suite SHALL cover the F1→F7 golden path

A Playwright + axe-core suite SHALL exercise the F1→F2→F3→F5→F6→F7 golden path,
asserting WCAG A/AA. Because the middleware boots in REAL mode (there is no
MOCK_MODE — `2026-06-01-retire-mock-mode`), the suite SHALL assert **live-stable
structural invariants** — frame testids (`onboarding-frame-f2/f3/f5`), schema
`field-row-*` presence, `cite-chip-*` presence, `advance-to-*` state-machine
transitions, and gate open/dismiss — and SHALL NOT assert deterministic MOCK_MODE
fixture strings (specific extracted values, canned LLM answers, or fixture doc
titles), which a real LLM + real GroundX do not reproduce.

The suite SHALL exercise the **actually-seeded** sample scenarios. A scenario
with no seeded live document is correctly omitted by the `ScenarioRegistry`
(joined by `filter.projectId`); its golden journey SHALL be explicitly skipped
with a reason that names the seeding ticket — never asserted against absent data
and never backed by fabricated mock data.

#### Scenario: Golden path passes against live data for each seeded scenario

- **WHEN** the Playwright suite runs against the seeded sample scenarios (Utility today) at the supported viewports
- **THEN** the F1→F7 golden path completes for each via structural invariants (frame mounts, field rows, citation chips, step-strip transitions, gate lifecycle)
- **AND** axe finds zero serious violations on each surface
- **AND** the suite asserts no MOCK_MODE fixture string

#### Scenario: An unseeded scenario's journey is skipped, not failed

- **GIVEN** a sample scenario (e.g. Loan) has no seeded live document
- **WHEN** the suite runs
- **THEN** that scenario's golden journey is `describe.skip`ped with a reason naming the seeding ticket
- **AND** the suite reports zero failures attributable to the absent scenario
