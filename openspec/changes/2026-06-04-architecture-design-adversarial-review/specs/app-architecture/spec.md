## ADDED Requirements

### Requirement: Architecture and design conformance reviews SHALL be adversarial, evidence-backed, and review-only

Whole-app architecture and design reviews SHALL evaluate the scaffold against
the project philosophy in `AGENTS.md` and `docs/agents/*`: composable
architecture over forked surfaces, TDD and user-visible proof over seam-only
claims, one source of truth, real round-trips, widget/tool contract conformance,
wireframe intent, design-system discipline, security/RBAC/observability seams,
and OpenSpec/GitHub planning hygiene.

The review SHALL produce visible audit artifacts with source or measured runtime
evidence, severity, user-visible impact, expected model, and issue handoff. The
review SHALL NOT modify product code while auditing.

#### Scenario: Review covers architecture and design axes

- **GIVEN** an architecture and design conformance review is executed
- **WHEN** the conformance report is complete
- **THEN** it includes verdicts for composition, production reuse, state
  ownership, data contracts, round-trip completeness, TDD posture, widget/tool
  contracts, design fidelity, runtime/accessibility evidence, security/ops
  seams, and planning hygiene
- **AND** each non-conforming verdict cites evidence and user-visible impact.

#### Scenario: Review tasks execute sequentially with adversarial gates

- **GIVEN** a review task has produced audit evidence
- **WHEN** the executor attempts to start the next task
- **THEN** `evidence/adversarial-reviews.md` contains a passed review entry for
  the completed task
- **AND** the entry records challenged claims, counterevidence searched, checked
  files or commands, verdict, and required correction
- **AND** a failed review blocks the next task until corrected.

#### Scenario: Runtime design claims use measured evidence

- **GIVEN** the review makes a runtime claim about layout, visibility,
  accessibility, network behavior, console state, or persisted/read state
- **WHEN** the claim is recorded
- **THEN** the evidence includes a measured browser, network, accessibility,
  console, or persistence value
- **AND** screenshots are corroborating evidence only.

#### Scenario: Confirmed findings receive issue handoff

- **GIVEN** the review confirms a gap that is not fixed because the change is
  review-only
- **WHEN** the review closes out
- **THEN** the finding is linked to an existing GitHub Issue, a newly created
  GitHub Issue, a blocked issue draft with exact title/body/labels, or an
  explicit no-action rationale
- **AND** no confirmed gap remains only in the report.

#### Scenario: Successful review archives its OpenSpec change

- **GIVEN** all review tasks and adversarial gates pass
- **AND** every confirmed finding has issue handoff or no-action rationale
- **WHEN** final validation passes
- **THEN** the audit artifacts are committed
- **AND** the OpenSpec change is archived
- **AND** post-archive validation passes.
