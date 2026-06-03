# testing-suite Specification (delta)

## ADDED Requirements

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
