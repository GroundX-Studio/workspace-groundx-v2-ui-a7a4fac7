# Pin-to-report: opt-in + compact extensible affordance

## Why

Today a full-width "📌 pin to report" pill renders under EVERY assistant
bubble — including scripted intro beats ("Bring questions about your document
type…"), agent narration ("I'm opening the engineer booking calendar"), and
booking-status turns. Pinning narration into a report is meaningless, and the
repeated pill is visual noise. Two problems: WHEN it shows (opt-out default) and
WHAT it is (a heavy pill).

## Independence

Independent of the report empty-state / default-template changes — it touches
only the chat turn affordance. May ship in any order.

## What changes

1. **Opt-in gating.** `LiveTurn` flag flips from opt-out (`pinToReport?: false`)
   to opt-IN (`pinnable?: boolean`); render gate `turn.pinnable === true`.
   `pinnable: true` is set ONLY at the genuine-answer mint sites (the `send()`
   server-reply turn + DB hydration of non-error assistant turns) — never on
   agent-projected narration, scripted intro/choreography, booking, or error
   turns. (Note: `pinToReport` is ALSO the ChatStore mutation — the rename
   touches ONLY the turn flag, not the mutation / `pin_to_report` tool /
   orchestrator intent.)
2. **Compact extensible affordance.** Replace the full-width pill with an
   `AnswerActions` control (internal `components/conversation/` component — under
   `components/` so `no-hardcoded-styles` enforces tokens, but NOT a
   `chat-widgets/`/`viewer-widgets/` slot so the widget contract does not apply)
   driven by an action LIST. With one action (pin)
   it renders a single inline icon; with ≥2 (future: copy / regenerate /
   cite-all) the SAME component renders a kebab (⋯) menu — no call-site change.
   The `pin` action renders the KEPT `PinToReportAction` chat-widget (contract
   intact) in a compact-icon variant; resolution logic + a transient "Pinned ✓"
   preserved. Real button, aria-label, keyboard + touch operable (NOT
   hover-only), design tokens only.

## Scope

**In:** the opt-in flag, the `AnswerActions` component (incl. the unit-tested
≥2-action kebab branch), the compact `PinToReportAction` variant, tests.

**Out:** adding a 2nd action (the kebab materializes by data when one is added —
earn-the-axis); any report-template work.

## Conformance to core architectural decisions

- **Composable (1).** The action LIST is the axis; the renderer adapts to length
  (icon → kebab). Adding an action = appending an item, not a rewrite.
- **Make-illegal-states-unrepresentable.** Pinnable is EARNED (opt-in at the
  answer seam), not the default; narration can't be pinned.
- **No dormant plumbing (5).** The ≥2-action kebab branch is unit-tested with a
  synthetic 2-action fixture so it isn't dead.
- **Widget contract (6).** `PinToReportAction` stays a contract-bound widget
  (README + sibling test + `.tools.ts` intact); `AnswerActions` is an internal
  `components/conversation/` component — under `components/` (so
  `no-hardcoded-styles` enforces tokens) but outside the widget slots (so
  `widget-contract.test.ts`, which walks only `chat-widgets/`+`viewer-widgets/`,
  does not apply).
- **TDD / adversarial review per task.**
