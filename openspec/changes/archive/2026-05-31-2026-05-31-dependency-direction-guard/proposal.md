# Widget-contract rule 5 (dependency direction) + ChatColumn untangle

## Why

The widget tiering has a live layering inversion that the guards do not catch.
`components/chat-widgets/ChatColumn/ChatColumn.tsx:44` imports `GateChatPanel` from
`@/views/Onboarding/` — a **widget importing a view** — and `GateChatPanel` imports
`GateChatRail` back out of `chat-widgets/`. That is a widget → view → widget cycle that
contradicts the documented dependency rule (`docs/agents/widget-contract.md` §235: widgets
"live at the top of the dependency tree" and may only import the three lower tiers
`brand/ · primitives/ · layout/`). The rule is documented but enforced by **nothing** at the
direction level — `madge`/ESLint catch only literal import cycles, and this particular cycle
slips through because it routes through a view. `GateChatPanel` is not view-shaped at all: it
is a pure chat-side composite (gate-status → `IdleChatPlaceholder` / `TypingIndicator` /
`GateChatRail`) that already mounts a chat-widget; it sits in `views/Onboarding/` only by
accident of history.

Left as-is this is exactly the "dormant convention enforced by docs, not tests" failure mode
the widget contract was built to prevent: the next widget that reaches into `views/` or into a
sibling widget slot will pass every check. We fix the one real inversion, then add the rule-5
assertion so it can never silently return.

## What Changes

1. **Untangle ChatColumn (must land first).** Move the gate composite out of `views/Onboarding/`
   into a chat-widget so no widget imports from `views/`. `GateChatPanel` becomes
   `components/chat-widgets/GateChatPanel/` (full widget treatment: `README.md`, sibling
   `*.test.tsx`, `role` + `scope` props per rules 1–4), carrying its local helpers
   (`useGateComposedPersisted`, `IdleChatPlaceholder`, `TypingIndicator`, the composing-delay /
   typing-copy tables). ChatColumn imports it from the chat-widget slot instead of the view.
   Update the two doc-comment references in `OnboardingShell.tsx` and the existing
   `GateChatPanel.test.tsx` location. After the move, `ChatColumn` → `GateChatPanel` →
   `GateChatRail` is a pure within-slot chat-widget chain; no widget imports a view.
2. **Add widget-contract rule 5 — dependency direction.** Extend
   `app/src/test/widget-contract.test.ts` with an assertion that walks every widget's source under
   `components/chat-widgets/` + `components/viewer-widgets/` and FAILS on any import whose specifier
   resolves to `@/views/` (or a relative path climbing into `views/`) **or** into the *other* widget
   slot. Within-slot widget→widget imports stay allowed (e.g. `ChatColumn` → `GateChatPanel` →
   `GateChatRail`), matching the documented "top of the tree" rule. The assertion can only go green
   once task 1 lands — hence task 1 is ordered first.
3. **Document the rule.** Promote §235 "Dependency rule" in `docs/agents/widget-contract.md` from a
   prose note to an explicit, test-backed rule 5 (cross-reference the test), so the doc and the
   guard agree.

## Conformance to core architectural decisions

- **Composable, not forked** — this removes a fork-by-misplacement (a chat composite stranded in a
  view) and unifies it into the chat-widget slot it already behaves as. No new parallel
  implementation; `GateChatRail` and the gate flow are unchanged.
- **No dormant plumbing** — the documented dependency rule becomes a real test. The untangle is
  ordered before the assertion so the assertion ships green, never as a spec-only future guard.
- **TDD** — the rule-5 assertion is written failing-first against the current inverted import, then
  the untangle makes it pass.
- **Done = user-visible round-trip preserved** — the gate flow (open → typing → `GateChatRail`,
  committed success card, dismiss) renders identically; only the file home and import direction
  change. No behavior delta.

## Out of scope

- Any change to gate behavior, copy, animation, or the `GateChatRail` widget itself.
- The broader `madge`/ESLint cycle configuration — rule 5 is a widget-slot-scoped source assertion,
  not a global graph rewrite.
- Re-tiering any other currently-correct widget; only the one real inversion is touched.

## Affected

- App: `components/chat-widgets/ChatColumn/ChatColumn.tsx` (import path); new
  `components/chat-widgets/GateChatPanel/` (moved file + `README.md` + `*.test.tsx`); removed
  `views/Onboarding/GateChatPanel.tsx` + `views/Onboarding/GateChatPanel.test.tsx`;
  `views/Onboarding/OnboardingShell.tsx` (doc comments); `app/src/test/widget-contract.test.ts`
  (rule-5 assertion).
- Docs: `docs/agents/widget-contract.md` §235.
- Specs: `app-architecture` (durable contract: widgets sit at the top of the dependency tree and
  import no view / no other widget slot).
