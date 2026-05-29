# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: Every interactive control SHALL declare a real tool or an honest no-tool reason

Every interactive control SHALL declare either a real LLM `tool` or an explicit `noTool` reason. This covers Button, IconButton, TextField, DropdownMenu items, and clickable brand surfaces (GxPill / GxSectionHeader). The placeholder reason
`"legacy — Phase 7 backfills tool"` SHALL NOT appear anywhere — it is the marker of an
un-backfilled stub and its presence is a failure. Product/agent-driven controls MUST
carry a real tool; controls deliberately outside the agent surface (pre-app auth)
SHALL carry `noTool` with a specific, truthful reason.

#### Scenario: No placeholder noTool reasons remain

- **GIVEN** the app source tree
- **WHEN** grepped for `legacy — Phase 7 backfills tool`
- **THEN** there are zero matches.

#### Scenario: A product control is LLM-invocable

- **GIVEN** the F6 SignUpWidget submit control
- **WHEN** the widget's tool catalog is inspected
- **THEN** a `submit_signup` tool exists and the submit Button references it.

#### Scenario: Auth controls keep an honest no-tool reason

- **GIVEN** the standalone Login / Register / password auth forms
- **WHEN** their submit Buttons are inspected
- **THEN** each carries `noTool` with the reason `"pre-app auth — not agent-driven"`
- **AND** none carries the placeholder reason.

### Requirement: The tool-binding drift guard SHALL cover every interactive surface

`check-tool-references.mjs` SHALL enforce the `tool | noTool` declaration on every
interactive surface, not only Button / IconButton / TextField. DropdownMenu items,
GxPill (when `onClick` is supplied), and GxSectionHeader (when `onClick` is supplied)
MUST be covered, so a clickable control cannot ship without declaring whether the LLM
can reach it.

#### Scenario: An unbound interactive surface fails the guard

- **GIVEN** a `GxPill` with an `onClick` and no `tool` / `noTool`
- **WHEN** `check-tool-references` runs
- **THEN** the guard reports the unbound control and fails.

### Requirement: The sanctioned tool-less widgets SHALL be explicitly named

The widget contract SHALL name exactly three widgets as sanctioned tool-less
exceptions: `ThinkingStream` (decorative), `SuggestedActionChips` (it is itself the
dispatch UI for tools the router already returned), and `ChatColumn` (the chat surface
itself). Each SHALL keep a `no-llm.md` carrying a specific rationale, and no other
widget may opt out without a documented, reviewed reason.

#### Scenario: The inert trio is documented, others are not silently exempt

- **GIVEN** the widget contract docs
- **WHEN** the sanctioned-exceptions list is read
- **THEN** it names exactly ThinkingStream, SuggestedActionChips, ChatColumn
- **AND** each of those widgets' `no-llm.md` states why no tool applies.
