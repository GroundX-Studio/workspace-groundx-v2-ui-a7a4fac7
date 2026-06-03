# testing-suite Specification (delta)

## ADDED Requirements

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
dependencies, the audit SHALL record the blocker and remain active or blocked
instead of archiving/signing off. A blocked required surface SHALL NOT be counted
as exercised, even when a backlog issue already exists for the underlying
implementation.

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
  exercised with measured evidence.
