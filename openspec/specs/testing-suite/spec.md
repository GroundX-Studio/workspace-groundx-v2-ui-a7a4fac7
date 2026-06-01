# testing-suite Specification

## Purpose

Define the durable contract for the scaffold's test layers — vitest
unit + view tests, round-trip closure tests (Rule 9), drift-guard tests
(no-hardcoded-styles, widget-contract), and the gate command that
declares a change shippable. Sets expectations for widget-test
adoption when harness exact-use widgets are in scope.

## Requirements
### Requirement: Widget-test infrastructure decision SHALL be made before any widget integration tests land

A product decision SHALL be recorded on whether the harness's exact-
use widgets are adopted at all. If yes, their tests MUST follow
harness-web-ui's `references/widget-testing.md`. If no, native surfaces
SHALL gain integration coverage via TS-05 instead.

#### Scenario: Decision recorded

- **WHEN** the widget-adoption decision is made
- **THEN** this requirement either resolves to "adopt and add tests" OR
  is replaced by reference to TS-05's native-surface coverage

### Requirement: Browser smoke + a11y suite SHALL cover the F1→F7 golden path

A Playwright + axe-core suite SHALL exercise the F1→F2→F3→F5→F6→F7
golden path at desktop AND mobile viewports, asserting WCAG A/AA. The
suite is BLOCKED on UI-01 (which is now closed) AND Solar fixture
delivery (SCEN-03 / SCEN-06).

#### Scenario: Golden path passes a11y at both viewports

- **WHEN** the Playwright suite runs against the Utility, Loan, AND Solar samples at desktop + mobile viewports
- **THEN** the F1→F7 golden path completes for each
- **AND** axe finds zero serious violations on each surface

### Requirement: Nightly visual regression SHALL produce a baseline + per-PR diff

Visual regression SHALL run nightly producing a stable baseline AND on
each PR a diff against that baseline. Blocked on platform decision
(Chromatic vs Playwright `toHaveScreenshot()` vs Percy vs Argos).
Cheapest start = Playwright snapshots.

#### Scenario: PR opens with a visual diff

- **GIVEN** an established baseline
- **WHEN** a PR changes a styled surface
- **THEN** the visual-regression job flags the diff on the PR before merge

### Requirement: Load test SHALL hit ≥100 concurrent chat sends with P95 < 5s

A load test SHALL drive ≥100 concurrent POSTs to `/api/chat/messages`
(or its streaming successor once CF-11 lands) against a mocked LLM +
GroundX backend, asserting P95 < 5s. Blocked on (a) streaming
implementation (CF-11) and (b) tool decision (k6 / Artillery /
Autocannon). Until then, a 100-concurrent JSON-POST variant satisfies
the spirit.

#### Scenario: 100 concurrent chat sends meet the P95 budget

- **GIVEN** the load test driver against mocked backends
- **WHEN** 100 concurrent requests run for 60s
- **THEN** P95 latency stays under 5s
- **AND** no 5xx errors are logged

