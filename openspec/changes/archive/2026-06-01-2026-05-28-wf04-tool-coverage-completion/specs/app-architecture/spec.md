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

### Requirement: A tool-less widget SHALL carry a documented no-llm.md rationale

A widget SHALL be tool-less ONLY if it carries a `no-llm.md` with a specific, reviewed
`## Why` (never boilerplate) — that documented rationale, enforced by
`widget-contract.test.ts`, is the sole sanction for opting out of an LLM tool. The widget contract SHALL name the inert/dispatch
trio — `ThinkingStream` (decorative), `SuggestedActionChips` (it is itself the dispatch UI for
tools the router already returned), and `ChatColumn` (the chat surface itself) — as the canonical
exceptions, and SHALL acknowledge any other current documented opt-outs rather than claim an
exhaustive count the tree contradicts.

#### Scenario: Every tool-less widget is documented, none is silently exempt

- **GIVEN** the widget contract docs and the `widget-contract.test.ts` guard
- **WHEN** the sanctioned tool-less widgets are read
- **THEN** the inert/dispatch trio (ThinkingStream, SuggestedActionChips, ChatColumn) are named as
  the canonical exceptions
- **AND** every widget with a `no-llm.md` (the trio plus any other current opt-out) carries a
  specific `## Why`, which the guard requires — so no widget is silently tool-less.
