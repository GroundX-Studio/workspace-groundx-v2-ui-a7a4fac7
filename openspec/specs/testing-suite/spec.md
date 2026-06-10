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

Tests SHALL exercise frontend network and rendered-runtime telemetry behavior by
injecting a single fake `Api` through the render harness
(`makeFakeApi(overrides?)` provided via `ApiProvider`), overriding only the
methods a test asserts. For boundaries owned by the injected `Api`, tests SHALL
NOT declare per-file `vi.mock` of the network module or Sentry wrapper. The fake
SHALL be type-checked against the `Api` interface so it cannot drift from the
real surface. A drift guard SHALL fail the build if a migrated network or
runtime telemetry boundary is imported directly outside the composition
root/client implementation, or re-mocked per-file.

Low-level API implementation tests MAY continue mocking transport modules such
as `@/api/axios` or `@/api/csrfFetch` when they are testing the API module
itself rather than a rendered runtime consumer. Low-level Sentry wrapper tests
MAY continue testing or mocking the wrapper directly.

#### Scenario: A component test uses the harness fake, no module mock

- **WHEN** a test renders a component that performs network operations
- **THEN** it provides behavior via `makeFakeApi({ ... })` through the harness
- **AND** it declares NO `vi.mock` for the injected network module
- **AND** the fake type-checks against `Api`

#### Scenario: The drift guard catches a regression

- **WHEN** a migrated component imports a network module directly, OR a test re-mocks a migrated network boundary
- **THEN** the drift-guard test fails
- **AND** the allowlist is limited to the composition root + the `Api` implementation

#### Scenario: Resource, extract, report, and scenario tests inject overrides

- **WHEN** a provider, view, widget, hook, or context test needs network behavior
  from a migrated domain
- **THEN** it passes the needed method through a render-harness fake override
- **AND** no file-scoped `vi.mock("@/api...")` is declared for that behavior

#### Scenario: Error-branch tests inject telemetry capture

- **WHEN** a rendered component/context/widget test asserts error capture
- **THEN** it observes the injected `api.telemetry` fake
- **AND** it does not `vi.mock("@/lib/sentry")` unless it is a low-level Sentry
  wrapper or API implementation test

#### Scenario: Guard catches direct runtime import regression

- **WHEN** a migrated component, context, hook, widget, or view value-imports
  `@/api` or a standalone API network module
- **THEN** the guard fails and reports the offending file and boundary

#### Scenario: Guard catches per-file mock regression

- **WHEN** a rendered consumer test reintroduces `vi.mock("@/api...")` or
  `vi.mock("@/lib/sentry")` for app-facing behavior
- **THEN** the guard fails and reports the offending file and boundary
- **AND** API transport and Sentry wrapper unit tests remain allowed only by
  explicit allowlist

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

### Requirement: Chrome DevTools MCP experience audits SHALL produce reproducible measured evidence

An end-to-end experience audit that uses Chrome DevTools MCP SHALL produce
reproducible measured evidence for every audited verdict. The audit SHALL use
Chrome DevTools MCP as the primary browser-inspection surface for navigation,
a11y snapshots, DOM measurements, console state, network requests and response
bodies, viewport emulation, and optional Lighthouse/performance checks.
Screenshots MAY be attached as corroborating artifacts, but a screenshot alone
SHALL NOT satisfy a pass/fail verdict.

The audit SHALL run in isolated browser contexts when state isolation matters,
SHALL distinguish clean-flow failures from deliberate negative/error probes, and
SHALL distinguish reproducible product defects from live-data or LLM variance.
Every task in the audit SHALL include an adversarial review before the next task
starts; the review SHALL check the task output against the execution plan, the
live browser state, console/network evidence, and the relevant OpenSpec/agent
guidance.

If a required audit surface is blocked by known backlog or environmental
dependencies, the audit SHALL record the blocker and either remain active or
blocked, or archive only after the remaining scope is explicitly reclassified
into backlog tracking and excluded from sign-off. A blocked required surface
SHALL NOT be counted as exercised, even when a backlog issue already exists for
the underlying implementation.

#### Scenario: Clean-flow browser evidence is complete

- **WHEN** the audit marks a clean-flow path as passing
- **THEN** the verdict cites the route, viewport, interaction, a11y or DOM state,
  measured rendered dimensions for key surfaces, app-owned network status and
  response-body checks, and console state
- **AND** any screenshot is only supporting evidence
- **AND** no unexplained console error, warning, issue, failed request, or
  unexpected 4xx/5xx remains attached to the clean-flow verdict.

#### Scenario: Negative probes are separated from product defects

- **WHEN** the audit intentionally exercises an invalid auth, gate, reset,
  offline, or other error branch
- **THEN** the verdict labels the probe as deliberate
- **AND** expected error responses are not counted as clean-flow failures
- **AND** the UI recovery state is verified with measured DOM/a11y evidence after
  the probe.

#### Scenario: Adversarial review gates each task

- **WHEN** an audit task finishes its execution steps
- **THEN** an adversarial review runs before the next task starts
- **AND** the review can reject the task for missing surfaces, screenshot-only
  proof, hidden console/network failures, duplicated tracking, missing regression
  coverage for fixed defects, or untracked deferred defects.

#### Scenario: Blocked required surfaces prevent sign-off

- **GIVEN** the audit identifies a required surface that cannot be exercised
  because it depends on known backlog work or an unavailable environment
- **WHEN** execution reaches closeout
- **THEN** the audit records the blocker and the linked issue or environment
  dependency
- **AND** the OpenSpec change is not archived as complete until that surface is
  exercised with measured evidence, or until the remaining scope is explicitly
  reclassified into backlog tracking and excluded from sign-off.

### Requirement: Required-surface gap closure SHALL retire Chrome audit blockers before sign-off

Required-surface gap closure SHALL verify the current state of each blocker, close stale or duplicate tracking, implement still-real blockers with failing user-visible regressions first, and replay the previously blocked surfaces in Chrome DevTools MCP before the audit is archived as signed off.

The follow-up SHALL keep backlog and active planning separate: GitHub issues
track deferred work, while an active OpenSpec change tracks the work being
executed. A backlog issue MAY block sign-off, but it SHALL NOT be counted as
completed coverage until the linked surface is replayed with measured evidence.

#### Scenario: Blocked audit surfaces are closed before archive

- **GIVEN** an active audit change records blocked required surfaces
- **WHEN** a follow-up gap-closure plan reaches closeout
- **THEN** each blocked surface has current source/test/browser evidence
- **AND** each linked GitHub issue is closed, updated, or explicitly left as
  backlog with a reason
- **AND** the original audit change is archived only after the required surfaces
  are exercised or after the remaining scope is honestly reclassified as backlog
  and excluded from sign-off.

#### Scenario: Stale blockers are not rebuilt

- **GIVEN** a linked GitHub issue may have been partially or fully shipped by an
  archived plan
- **WHEN** the follow-up starts the task for that issue
- **THEN** the executor first verifies current source, tests, OpenSpec history,
  and live browser behavior
- **AND** closes or narrows stale issue text before writing implementation code.

### Requirement: Scaffold philosophy conformance audits SHALL be evidence-backed and review-only

Whole-scaffold conformance audits SHALL evaluate the repository against the
scaffold philosophy: composable production surfaces over onboarding forks, real
data over mock-only polish, user-visible round-trips over seams, one source of
truth, Template + Scope + Results lifecycle reuse, widget/tool contract
compliance, and OpenSpec/GitHub backlog hygiene. The audit SHALL produce a
visible report and finding register with source evidence, severity, user-visible
impact, and issue handoff. The audit SHALL NOT modify product code while
reviewing.

Originating references: `docs/agents/principles.md`,
`docs/agents/real-data-rewire-gap.md`,
`docs/agents/template-scope-results.md`,
`docs/agents/widget-contract.md`, `docs/agents/testing.md`,
`openspec/wireframes/source/spec-flow.jsx`, and the companion steady-mode
wireframes when present.

#### Scenario: Audit covers every philosophy axis

- **GIVEN** a scaffold philosophy conformance audit is executed
- **WHEN** the audit report is complete
- **THEN** it includes verdicts for composition versus forking, production
  widget reuse, real-data paths, round-trip completeness, Template + Scope +
  Results, widget/tool contracts, source-of-truth hygiene, wireframe fidelity,
  and test evidence
- **AND** each non-conforming verdict cites source evidence and user-visible
  impact.

#### Scenario: Audit stays review-only

- **GIVEN** the audit confirms a product defect
- **WHEN** the audit closes out
- **THEN** the defect is recorded with evidence and handed off to an existing or
  new GitHub Issue
- **AND** the audit change does not modify product code, generated runtime
  surfaces, or tests to fix the defect in place.

#### Scenario: Audit tasks execute sequentially with adversarial review gates

- **GIVEN** a scaffold philosophy conformance audit task is completed
- **WHEN** the executor attempts to start the next task
- **THEN** `evidence/adversarial-reviews.md` contains a passed review entry for
  the completed task
- **AND** that entry records the claims challenged, counterevidence searched,
  checked files or commands, verdict, and any required correction
- **AND** a failed review blocks the next task until the audit artifact or issue
  handoff is corrected and the review passes.

#### Scenario: Runtime claims use measured evidence

- **GIVEN** the audit makes a runtime claim about a visible surface
- **WHEN** the claim is recorded
- **THEN** the evidence includes a measured browser, network, accessibility,
  console, or persisted/read state
- **AND** screenshots, if present, are corroborating evidence rather than the
  sole proof.

#### Scenario: Successful audit archives its OpenSpec change

- **GIVEN** the audit has completed all tasks and every confirmed gap has GitHub
  issue handoff or an explicit no-action rationale
- **WHEN** final validation passes
- **THEN** the audit artifacts are committed
- **AND** the OpenSpec change is archived
- **AND** post-archive OpenSpec validation passes
- **AND** `openspec list` no longer shows the audit change as active.

### Requirement: Tool metadata drift guards SHALL prevent app-side runtime handler regression

The app test suite SHALL include a guard that scans app `*.tools.ts`
declarations, including scaffold template declarations, and fails if any
declaration contains a runtime `handler` field.
The same guard SHALL fail if a production app `toolRegistry` singleton is
reintroduced. Declarative app tool metadata remains allowed for parity,
quality, references, and viewer widget descriptors.

#### Scenario: Handler field returns to app tool metadata

- **GIVEN** an app `*.tools.ts` file contains `handler:`
- **WHEN** app tool metadata tests run
- **THEN** the tests fail and name the offending file.

#### Scenario: Runtime app tool registry returns

- **GIVEN** `app/src/tools/registry.ts` is restored
- **WHEN** app tool metadata tests run
- **THEN** the tests fail because production app registry execution is no
  longer a valid source of truth.

### Requirement: Scoped project tests SHALL guard the projectId vocabulary

The app test suite SHALL include a focused guard for scoped project surfaces
that fails if `/projects` or Project `ChatExperience` source reintroduces
`filter.project`. Behavior tests SHALL also prove the ready-state project scope
uses `filter.projectId` and the loading state does not create a fallback
project-scoped chat session with a scenario slug.

#### Scenario: Scoped project source reintroduces filter.project

- **GIVEN** scoped project route or experience source contains
  `filter: { project: ... }` or reads `scope.filter.project`
- **WHEN** the scoped-project vocabulary guard runs
- **THEN** it fails and names the offending file.

#### Scenario: Project route tries to create a slug fallback session

- **GIVEN** the scenario registry is not ready
- **WHEN** `/projects` mounts the scoped conversation shell
- **THEN** it does not create a project chat session with
  `filter.projectId:"utility"` or `filter.project:"utility"`.

### Requirement: Infrastructure PR reviews SHALL prove every changed gate before merge

Infrastructure and hygiene PR reviews SHALL verify every touched test, lint,
build, logging, hook, contract, and documentation gate before merge. The review
MUST start by attempting to reproduce the PR's claimed failing behavior or
failing gate on the base branch, then verify the PR head with targeted and broad
commands. Claims that require a runtime not available to the reviewer, such as
Node 24/25-only behavior, MUST be marked as externally verified or not locally
verified; they SHALL NOT be silently accepted.

Each changed file SHALL receive an explicit review verdict backed by source
inspection and at least one applicable command, contract check, or documented
runtime constraint. Mechanical cleanup SHALL be reviewed as behavior too: removed
eslint-disable comments, whitespace-only lines, warning-count claims, and
documentation status changes all require evidence.

#### Scenario: PR review signs off with file-level evidence

- **GIVEN** a PR changes test setup, lint policy, logging gates, hook deps,
  contract tests, and docs
- **WHEN** the reviewer completes the OpenSpec review plan
- **THEN** every changed file has a verdict row with evidence
- **AND** every PR claim is either verified, externally evidenced, or called out
  as unverified
- **AND** no confirmed merge blocker remains only in local notes.

#### Scenario: Runtime-specific claims are not silently accepted

- **GIVEN** a PR claims to fix a Node 24/25-only test failure
- **WHEN** the reviewer only has Node 20 locally
- **THEN** the review records the local runtime limit
- **AND** the claim is backed by CI, another reviewer runtime, or a required
  follow-up before merge.

### Requirement: A shared intent catalog SHALL be the single source of truth, and an FE replay corpus SHALL cover every CanvasIntent kind without calling the LLM

A data-only `intentCatalog` SHALL live in `@groundx/shared` behind a
**dedicated non-runtime subpath export** (NOT the `.` runtime entry, so its
dev/test data — including live prompts — is excluded from production bundles).
Each entry SHALL carry `kind`, `class`, and `llm` = `false` (not LLM-emittable)
or `{ toolName, prompt }` (the emitting tool + a prompt; the asserted kind is
the entry's own `kind`, with no separate field). BOTH the `app` and
`middleware` workspaces SHALL import this same source (they cannot import each
other's test files). The frontend replay corpus SHALL provide, keyed by catalog
`kind`, a trigger that is either a canned `ChatReply` — replayed through the
real `useConversation` derivation → `CanvasOrchestrator` dispatch → `ChatStore`
sink pipeline via the `makeFakeApi` chat seam, returning the full envelope
`{ userMessageId, assistantMessageId, compressionRan, reply }` that
`useConversation` reads as `result.reply` — or a direct `dispatch(intent,
source)`. No fixture SHALL cause a real LLM request. Each fixture's assertion
SHALL target the resulting **sink state** (ChatStore mutation, adapter call, or
onboarding-session call) — not merely re-assert the dispatched argument.

#### Scenario: A canned reply drives the real derivation pipeline

- **GIVEN** a fixture whose trigger is a `ChatReply` carrying a primary citation
- **WHEN** the replay engine resolves `api.chat.sendChatMessage` with that reply and runs a chat turn
- **THEN** the `highlightCitation` intent is derived and dispatched, and the active `doc-viewer` step gains the expected highlight
- **AND** no request reaches a real LLM provider

#### Scenario: Direct-UI intents are covered too

- **GIVEN** a fixture for a UI-originated kind (e.g. `showSample`, `openDocument`, `editSchema`) using `via:"dispatch"`
- **WHEN** the replay engine dispatches it with its declared source
- **THEN** the registered adapter (or built-in sink) is invoked with the expected payload

### Requirement: A completeness guard SHALL fail when a CanvasIntent kind has no fixture

A guard test SHALL derive the kind list from `canvasIntentSchema` at runtime
(never a hand-maintained copy) and SHALL fail if any kind lacks an
`intentCatalog` entry or an FE replay fixture. This makes intent coverage a
property of the data: a newly added intent kind cannot ship green without a
catalog entry and a fixture.

#### Scenario: New intent kind without a fixture

- **GIVEN** a new `kind` is added to `canvasIntentSchema`
- **WHEN** the guard runs and no fixture has that `kind`
- **THEN** the guard fails, naming the uncovered kind

### Requirement: A dev-only intent harness SHALL exercise every intent live and be absent from production builds

The system SHALL provide the intent harness as a panel within the SINGLE dev
menu (`DebugOverlay`, gated on `?debug=true`) — there SHALL NOT be a second
parallel dev menu. The harness panel SHALL be surfaced by a "Fire intent" toggle
that appears ONLY on the appropriate (canvas-bearing onboarding) screens, where
firing has a visible effect. The panel renders every FE replay fixture grouped
by catalog class (viewer-loading / ux-interaction) with a control that fires the
fixture so the canvas + chat react on screen. Firing SHALL dispatch the
fixture's computed intent(s) directly to the live orchestrator (via the exported
derivation helpers for reply-derived kinds, the pre-built intent for
`via:"dispatch"` kinds, or — for `script` multi-step kinds like accept/reject —
the full seed→read-generated-id→mutate sequence against a LIVE session read) and
SHALL NOT route through `useConversation.send` — so the harness makes **no real
LLM call** in the running app. The "Fire intent" toggle's screen-gating SHALL
stay correct across client-side (`pushState`/`replaceState`) navigations, not
only reload/`popstate`. It SHALL reuse the **same** fixtures + shared
`intentCatalog` as the tests (one source of truth) and SHALL render `null`
outside `?debug=true` (not reachable in a production build). Its intentionally
off-brand styling SHALL be on the `no-hardcoded-styles` allowlist (as
`DebugOverlay` is).

#### Scenario: Firing a viewer-loading fixture changes the canvas

- **GIVEN** `?debug=true` on a canvas screen and the "Fire intent" panel is open
- **WHEN** the developer fires a viewer-loading fixture (e.g. `showExtract`)
- **THEN** the canvas advances to the corresponding frame/surface, with no `/api/chat/messages` request

#### Scenario: One dev menu, gated to the appropriate screens

- **GIVEN** `?debug=true`
- **WHEN** the screen is NOT a canvas (onboarding) screen
- **THEN** the single `DebugOverlay` shows but the "Fire intent" toggle is hidden (no second menu, no intent panel)

#### Scenario: Gating stays correct across client-side navigation

- **GIVEN** `?debug=true` on a canvas screen with the toggle shown
- **WHEN** the app navigates client-side (`pushState`, no reload/`popstate`) to a non-canvas screen that keeps `?debug=true`
- **THEN** the bar stays but the "Fire intent" toggle hides; navigating back re-shows it

#### Scenario: Harness is not shipped to production

- **WHEN** the `?debug=true` param is absent
- **THEN** the dev menu (and its intent panel) render `null`

### Requirement: An on-demand live-LLM suite SHALL cover every LLM-emittable intent and SHALL NOT run in the default gate

The system SHALL provide a key-gated suite in the **middleware** project,
enabled only when `INTENT_LIVE` is set and real LLM/GroundX credentials are
present, that injects a **real `LlmClient`** through the same `chatHandler`
`deps.llmClient` seam the stub corpus uses, sends each LLM-emittable intent's
prompt to the real model, and asserts the reply emits that intent's kind.
Coverage SHALL be the full set of LLM-emittable intents — every intent
reachable via a `SERVER_TOOL_CATALOG` tool `intentBuilder` (`highlightCitation`
is among them, also reachable via the citation path) — sourced from the `llm`
field of the shared `intentCatalog` (one source of truth). The suite SHALL be runnable as a whole
or for a single intent (`INTENT_LIVE=<kind>`), SHALL be excluded from the
default test gate, and SHALL skip cleanly (not fail) when the env/keys are
absent. The assertion SHALL be on the emitted **intent kind** (not answer text),
with a bounded retry — it is a **best-effort diagnostic against a
nondeterministic model**, not a deterministic gate.

Intents that are NOT reliably elicitable from a single fresh-session turn
(those needing prior conversational context — a pending proposal to accept, a
prior answer to pin — and those the model under-elicits because a more general
tool covers them) SHALL be marked `llm.liveSingleTurn: false` with a required
`llm.liveNote`, and the live suite SHALL SKIP them VISIBLY (the reason in the
test title) rather than fail. They remain fully covered by the FE replay +
middleware corpus. A live-coverage guard SHALL fail if any LLM-emittable kind
lacks an `llm` prompt, if a non-LLM-emittable (pure-UI) kind carries one, OR if
a `liveSingleTurn:false` entry lacks a `liveNote` — so neither the LLM/non-LLM
boundary nor a live skip drifts silently.

#### Scenario: Default gate runs no live calls

- **GIVEN** real credentials are present but `INTENT_LIVE` is unset
- **WHEN** the default test gate runs
- **THEN** the live suite is skipped and no real LLM request is made

#### Scenario: A single intent can be tested on demand

- **GIVEN** `INTENT_LIVE=showExtract` with valid credentials
- **WHEN** the live suite runs
- **THEN** only the `showExtract` case sends a prompt to the real model, and it asserts the reply emits a `showExtract` intent

#### Scenario: Every LLM-emittable intent is covered

- **GIVEN** the live-coverage guard runs
- **WHEN** an intent reachable via a tool `intentBuilder` has `llm: false` or no prompt in the catalog
- **THEN** the guard fails, naming the uncovered intent

#### Scenario: Non-LLM-emittable intents are excluded by design

- **GIVEN** an intent with no tool `intentBuilder` (`showSample`, `openDocument`, `showCitations`, or `editSchema`) that the model never emits
- **WHEN** the live-coverage guard runs
- **THEN** it requires that intent's catalog entry to be `llm: false` (it is covered by the FE corpus instead), and fails if a prompt is added

#### Scenario: Not-single-turn intents are skipped visibly, never silently

- **GIVEN** an intent marked `llm.liveSingleTurn: false` with a `liveNote` (e.g. `acceptSchemaField` — needs a pending proposal)
- **WHEN** the live suite runs
- **THEN** that intent's case is SKIPPED with the `liveNote` shown in the test title, no LLM call is made for it, and the coverage guard confirms the `liveNote` is present

