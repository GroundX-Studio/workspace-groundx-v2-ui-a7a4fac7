# WF-04: complete tool coverage (retire the noTool stubs)

## Why

The Phase 5b "blanket noTool migration" stamped every interactive primitive call
site with `noTool="legacy — Phase 7 backfills tool"`. Phase 7 added widget-contract
docs but **never did the backfill** — so 16 interactive controls still declare "the
LLM can't reach me" with a placeholder reason that was always meant to be temporary.

`widget-intent-coverage-audit.md` also found the `tool|noTool` drift guard only
enforces 3 primitives (Button/IconButton/TextField); interactive `DropdownMenu`,
`GxPill`, and `GxSectionHeader` escape it entirely.

Decision (2026-05-28): **every interactive control declares its real tool stance.**
- Interactive *product* controls → real tools the LLM can invoke.
- Auth controls → stay `noTool`, but with an honest reason (pre-app, not agent-driven).
- Genuinely presentational widgets → stay declared-inert (documented), not forced.

## The noTool census (what's being retired)

| Site | Controls | Resolution |
|---|---|---|
| `SignUpWidget` | 5 TextField + 1 submit Button | widget gets `tools.ts` with a `submit_signup` mutate tool; submit Button → that tool; the 5 inputs stay `noTool` with honest reason ("value collected by submit_signup") |
| `OnboardingWizard` | Not now / back / finish / next | real tools: `dismiss_wizard`, `wizard_back`, `wizard_finish`, `wizard_next` (read-style nav → auto-dispatch CanvasIntents) |
| `GateChatRail` | 1 stray Button | map to the widget's existing `commit_gate` / `dismiss_gate` tool (widget already has `tools.ts`) |
| `DialogTitle` (primitive) | close IconButton | `close_dialog` tool (mutate; dismisses the active dialog) |
| Auth forms (Login, Register, ConfirmChangePassword, VerificationEmail) | 4 submit Buttons | **stay noTool** — replace the placeholder reason with `"pre-app auth — not agent-driven"` |

## What changes

1. **SignUpWidget** → add `SignUpWidget.tools.ts` (`submit_signup` mutate tool +
   CanvasIntent + orchestrator handler + server-catalog mirror); delete its
   `no-llm.md`; submit Button references the tool; inputs → honest `noTool`.
2. **OnboardingWizard** → 4 nav tools + intents + handlers + catalog mirror.
3. **GateChatRail** → stray Button wired to the existing gate tool (no new tool).
4. **DialogTitle** → `close_dialog` tool + intent + handler + catalog mirror.
5. **Auth forms** → swap the 4 placeholder `noTool` reasons for the honest one.
6. **Widen the binding guard** (`check-tool-references.mjs`) to require `tool|noTool`
   on `DropdownMenu` items, `GxPill` (when `onClick`), `GxSectionHeader` (when
   `onClick`) — then resolve each (real tool or honest `noTool`).
7. **Document the inert trio** in `widget-contract.md`: `ThinkingStream`
   (decorative), `SuggestedActionChips` (it *is* the dispatch UI), `ChatColumn`
   (the chat surface itself) keep `no-llm.md` with an explicit "why no tool" — these
   are the sanctioned exceptions to "every widget needs a tool."

## Out of scope

- WF-03 (citation bbox resolution) — separate change.
- Inventing tools for the inert trio (explicitly sanctioned exceptions).
- Auth becoming agent-driven (decided: keep noTool).

## Affected

- App: `SignUpWidget` (+tools.ts, −no-llm.md), `OnboardingWizard`, `GateChatRail`,
  `DialogTitle`, the 4 Auth forms, `widget-tools/registry` + `CanvasIntent` types +
  orchestrator handlers, `scripts/check-tool-references.mjs` (+ its test),
  `DropdownMenu`/`GxPill`/`GxSectionHeader`.
- Middleware: `services/toolCatalog.ts` (mirror the new tools).
- Specs: `app-architecture` (every interactive control declares a tool stance;
  the sanctioned-inert exceptions are named).
