# testing-suite Specification (delta)

## MODIFIED Requirements

### Requirement: Browser smoke + a11y suite SHALL cover the F1→F7 golden path

A Playwright + axe-core suite SHALL exercise the F1→F2→F3→F5→F6→F7 golden path,
asserting WCAG A/AA. Because the middleware boots in REAL mode (there is no
MOCK_MODE — `2026-06-01-retire-mock-mode`), the suite SHALL assert **live-stable
structural invariants** — frame testids (`onboarding-frame-f2/f3/f5`), schema
`field-row-*` presence, `cite-chip-*` presence, the F2→F3 auto-advance, and the
gate lifecycle — and SHALL NOT assert deterministic MOCK_MODE fixture strings
(specific extracted values, canned LLM answers, or fixture doc titles), which a
real LLM + real GroundX do not reproduce.

The gate / sign-up / BYO / provenance steps SHALL be asserted via the CURRENT
triggers, with **no `test.fixme` carve-out** for them:

- The sign-up **gate opens** when an anonymous user invokes the Extract
  **unlock banner** (`extract-unlock-banner` → `openGate("save")`) — NOT a
  removed `advance-to-f6` affordance, and not the topbar Save (which is disabled
  until there are unsaved edits). The gate is a **magic-link / SSO chat rail**
  (`gate-rail-email` + `gate-rail-send-magic-link` → `gate-rail-committed`),
  dismissed via "Keep exploring" (`gate-rail-dismiss`) — NOT the removed
  `SignUpWidget` registration form and NOT ESC (chat-rail, not a modal).
- **BYO** navigates `byo-pdf` → `/onboarding/signup`, mounting the same magic-link
  gate surface.
- The **provenance peek** (`field-provenance-panel`, opened by clicking a cited
  `field-row-*`) SHALL show that field's citations from the SAME source the
  field-row chip reads (one citation source, no view-to-view loss).

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

#### Scenario: The gate / BYO / provenance steps are asserted, not fixme'd

- **GIVEN** the gate opens via anon Save on Extract and BYO via `/onboarding/signup`
- **WHEN** the suite runs the seeded golden journey
- **THEN** gate open + "Keep exploring" dismiss, magic-link sign-in commit (email → send → committed card), empty-email no-op, the canvas content swap (sample hides behind the value-prop, restores on dismiss), the BYO magic-link surface, and the provenance citation peek all assert their current testids and pass
- **AND** none of these steps remain marked `test.fixme`

#### Scenario: An unseeded scenario's journey is skipped, not failed

- **GIVEN** a sample scenario (e.g. Loan) has no seeded live document
- **WHEN** the suite runs
- **THEN** that scenario's golden journey is `describe.skip`ped with a reason naming the seeding ticket
- **AND** the suite reports zero failures attributable to the absent scenario
