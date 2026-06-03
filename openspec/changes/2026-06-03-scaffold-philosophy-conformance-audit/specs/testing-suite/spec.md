## ADDED Requirements

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
