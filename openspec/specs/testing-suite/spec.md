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

### Requirement: The experience SHALL pass a full end-to-end interaction audit before release

The running experience SHALL pass a full end-to-end interaction audit in which every
interactive control on every surface is exercised via browser automation, and every defect
found is fixed or explicitly triaged + ticketed, before the change is released. The audit
SHALL be driven against the live paired frontend + middleware, SHALL be scoped by a written
interaction inventory that enumerates every control and navigation path, and SHALL conclude
only when every inventoried path has been exercised AND the defect log has no open defect.

#### Scenario: Audit signs off with no open defect

- **GIVEN** the live experience and a written interaction inventory enumerating every interactive control and navigation path
- **WHEN** the audit exercises every inventoried control via browser automation and records the result of each
- **THEN** every inventory row is marked exercised
- **AND** the defect log contains no `open` row — every logged defect is either `reverified` (fixed and re-checked) or `triaged-ticketed` (deferred to a referenced ticket)
- **AND** the change is not released while any open defect remains.

### Requirement: Audit verdicts SHALL be backed by measured evidence, not screenshots alone

Every "expected effect" verdict in the audit SHALL be backed by a measured value obtained via
browser inspection — a real rendered dimension, visibility, attribute, scroll position, a
network response body, a console state, or an accessibility-tree node — captured via the
DevTools inspection MCP. A screenshot SHALL be corroborating evidence only and SHALL NOT by
itself stand as proof that a control worked. In particular, "rendered" SHALL require asserting
non-collapsed rendered dimensions (both width and height greater than zero), so a visually
plausible but functionally collapsed surface (e.g. a height-collapsed PDF canvas) is caught.

#### Scenario: A rendered surface is proven by measured dimensions

- **WHEN** the audit verifies that a surface (e.g. the PDF viewer canvas) rendered
- **THEN** the verdict cites a measured rendered width AND height, both greater than zero, read from the live DOM
- **AND** a screenshot is attached only as corroboration, never as the sole proof.

#### Scenario: A control effect is proven by measured state change

- **WHEN** the audit drives a control (e.g. a JSON-render toggle, a zoom button, a password show/hide toggle)
- **THEN** the verdict cites the measured before/after state (e.g. the output format, the rendered scale, or the input `type` attribute) read from the live DOM, network body, or a11y tree
- **AND** not from glancing at a screenshot.

### Requirement: The audit SHALL cover the enumerated interaction surfaces

The interaction inventory SHALL cover, and the audit SHALL exercise, at minimum: the
onboarding flow F1→F7 (sign-up, ingest / sample picker, understand / PdfViewer, extract /
Extract widget + schema builder, interact / chat, report render + builder, integrate); steady
mode (workspaces / projects navigation and the same production widgets on real data); every
widget's controls (PdfViewer zoom / page / citation chips, Extract field add / edit /
JSON-render toggle, SmartReport render + section accept / reject + builder, Integrate
connectors); the chat surface (input, thinking stream, suggested-action chips,
propose-schema-field card, booking card); gates (open / commit / dismiss and the gate
overlay); the citation chip → viewer mount round-trip landing on real geometry; auth (login,
register, password show / hide, claim / anonymous→authenticated flip); the debug-overlay
reset; responsive breakpoints; and reduced-motion. No inventoried surface SHALL be skipped at
sign-off.

#### Scenario: Every enumerated surface is exercised

- **GIVEN** the interaction inventory covering onboarding F1→F7, steady mode, each widget's controls, the chat surface, gates, the citation round-trip, auth, the debug reset, responsive breakpoints, and reduced-motion
- **WHEN** the audit completes
- **THEN** each of those surfaces has been driven live with its controls exercised and a recorded verdict
- **AND** any surface left unexercised blocks sign-off.

### Requirement: Each audit-found defect SHALL be reproduced by a regression test where feasible before its fix

Each confirmed defect found by the audit that is fixed in this change SHALL, where feasible,
first be reproduced by a failing regression test (view test, widget test, round-trip test, or
a browser-measured assertion when no unit-level test can reach it); the fix SHALL then make
that test pass and SHALL be re-verified live with a fresh measured pass on the real surface. A
defect that is not fixed in this change SHALL be explicitly triaged and ticketed (an OpenSpec
change or a spawned task), with no dormant or stale code left behind.

#### Scenario: A fixed defect carries a regression test and a live re-verification

- **GIVEN** a confirmed defect with a measured wrong behavior
- **WHEN** it is fixed in this change
- **THEN** a regression test that reproduced the wrong behavior exists and now passes
- **AND** the defect is re-verified live with a fresh measured value matching the expected behavior.

#### Scenario: A deferred defect is triaged and ticketed

- **GIVEN** a confirmed defect that is out of scope to fix in this change
- **WHEN** the audit closes out
- **THEN** the defect is recorded as triaged with a reference to its tracking ticket (OpenSpec change or spawned task)
- **AND** no partial or dormant code for it is left in the tree.

### Requirement: An interactive inspection sweep SHALL complement the Playwright structural suite

The onboarding experience SHALL be periodically exercised by an interactive
inspection sweep, using Chrome DevTools MCP as the inspector, that catches visual
defects and incidental control bugs the Playwright structural suite does not. The
sweep SHALL enumerate and exercise every interactive control on every onboarding
surface (F1–F7 plus the step strip, nav rail, and compact-mode chrome) at the
supported viewports (desktop, tablet, mobile). For each surface it SHALL assert no
new console error or warning, no unexpected failed network request, no horizontal
overflow / clipped / overlapping / zero-size control, and no visual defect. It
SHALL run against real GroundX + a real LLM and MUST exclude live-data / LLM
variance from findings. Each confirmed finding SHALL be filed as a labeled GitHub
Issue (`bug` | `visual` + `area:*` + severity) rather than fixed in place.

#### Scenario: Interactive sweep exercises every control and logs defects

- **WHEN** the onboarding interactive inspection sweep runs at desktop, tablet, and mobile viewports
- **THEN** every interactive control on every onboarding surface (F1–F7 + step strip / nav / compact chrome) is exercised
- **AND** each surface is checked for console errors, failed network requests, horizontal overflow, and visual defects
- **AND** every confirmed defect (excluding live-data / LLM variance) is filed as a labeled GitHub Issue with reproduction steps + evidence
- **AND** the run reports a surface × viewport coverage table proving no surface was skipped

### Requirement: Tests SHALL inject one fake Api, not per-file network mocks

Tests SHALL exercise frontend network behavior by injecting a single fake `Api`
through the render harness (`makeFakeApi(overrides?)` provided via `ApiProvider`),
overriding only the methods a test asserts. For boundaries owned by the injected
`Api`, tests SHALL NOT declare per-file `vi.mock` of the network module. The fake
SHALL be type-checked against the `Api` interface so it cannot drift from the real
surface. A drift guard SHALL fail the build if a migrated network boundary is
imported directly (outside the composition root + the client implementation) or
re-mocked per-file.

#### Scenario: A component test uses the harness fake, no module mock

- **WHEN** a test renders a component that performs network operations
- **THEN** it provides behavior via `makeFakeApi({ ... })` through the harness
- **AND** it declares NO `vi.mock` for the injected network module
- **AND** the fake type-checks against `Api`

#### Scenario: The drift guard catches a regression

- **WHEN** a migrated component imports a network module directly, OR a test re-mocks a migrated network boundary
- **THEN** the drift-guard test fails
- **AND** the allowlist is limited to the composition root + the `Api` implementation

### Requirement: Auth tests SHALL use the injected Api fake instead of per-file network mocks

Auth-domain tests SHALL provide customer-auth behavior through
`makeFakeApi({ auth: ... })` via `ApiProvider` or the app render harness. They
SHALL NOT `vi.mock("@/api")` or mock customer-auth network modules per file once
the auth slice migrates. The drift guard SHALL fail if migrated auth files
reintroduce those direct imports or mocks.

#### Scenario: AuthProvider test injects one fake auth client

- **WHEN** `AuthProvider.test.tsx` asserts login/register/reset/logout/update
  metadata behavior
- **THEN** it wraps the provider in `ApiProvider value={makeFakeApi({ auth: ... })}`
- **AND** it does not declare `vi.mock("@/api")`

#### Scenario: Auth route tests inject auth overrides through the render harness

- **WHEN** `Login.test.tsx`, `Register.test.tsx`, or `ResetPassword.test.tsx`
  needs auth network behavior
- **THEN** the test passes `api: { auth: ... }` to `renderWithAppProviders`
- **AND** it asserts visible route/form behavior rather than module-call plumbing

#### Scenario: The drift guard catches auth-domain mock regression

- **WHEN** an auth test reintroduces `vi.mock("@/api")`
- **THEN** `frontend-api-injection-guard.test.ts` fails with the offending file
- **AND** unmigrated non-auth domains are not flagged by this auth-slice guard

