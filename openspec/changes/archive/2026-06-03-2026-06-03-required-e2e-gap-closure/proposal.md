# Required E2E gap closure after Chrome DevTools audit

## Why

The Chrome DevTools MCP audit executed successfully for the surfaces it could
drive, but it could not honestly sign off the whole experience. Four required
surface families remain unexercised or blocked:

- F7 Integrate real user flow: GitHub `#4`.
- Steady Workspaces/Projects non-document widget parity and per-entry session
  behavior: GitHub `#5` / `#6`.
- SmartReport rendered Utility sections and section controls: GitHub `#11`.
- Lighthouse metadata cleanup: GitHub `#12`.

The previous audit plan now remains active/blocked. This change is the execution
plan that closes those blockers, replays the required Chrome DevTools evidence,
then archives the blocked audit change only when the missing surfaces are
actually exercised.

## What Changes

- Re-verify each blocker from source, tests, GitHub, OpenSpec, and Chrome
  DevTools evidence before implementing so stale issues can be closed instead of
  rebuilt.
- Close the blockers in a sequential order that maximizes user-visible coverage:
  SmartReport rendered sections first, F7 Integrate next, steady parity/session
  behavior after that, and metadata cleanup last.
- For every code change, write the failing user-visible regression first, then
  implement the smallest fix, then replay the changed surface in Chrome DevTools
  MCP before advancing.
- Update or close the linked GitHub issues as each blocker is genuinely resolved.
- Archive the original Chrome DevTools audit change only after the final replay
  proves the previously blocked surfaces are covered.

## Conformance to core architectural decisions

- **Composable, not forked:** this plan must reuse the production
  ScopedViewerWidget and ConversationFlow surfaces. It may add an axis value or
  configuration only when the second real caller is named in the task evidence.
- **Done-able:** each task names its closure gate, live replay requirement, and
  linked issue. A task is not done when the seam compiles; it is done when the
  user-visible surface works and the linked issue can be updated or closed.
- **One source of truth:** OpenSpec owns this active execution plan. GitHub owns
  deferred/backlog tracking. No separate tracker file is introduced.

## Out of Scope

- Re-running the whole exploratory audit from scratch before the four blockers
  are addressed.
- Adding new onboarding-only variants of production widgets.
- Production deploy or destructive account/customer operations.
- Treating a unit-only seam as sufficient for closing any linked issue.

## Risks

- Some issues may be stale because earlier archived plans partially shipped the
  underlying work. T0 requires proving the current state before editing.
- Live GroundX/LLM behavior can vary. The plan asserts structural, measured
  invariants and separates live-data variance from deterministic product
  defects.
- Steady-mode parity may be too broad for one task. If T3 finds multiple
  independent blockers, it must split them into GitHub issues before editing.
