# testing-suite Specification (delta)

## ADDED Requirements

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
