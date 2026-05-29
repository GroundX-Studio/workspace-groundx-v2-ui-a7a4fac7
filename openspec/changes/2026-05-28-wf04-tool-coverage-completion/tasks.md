# Tasks — WF-04 complete tool coverage

> **Progress 2026-05-29: census cleanup DONE; tool-building REMAINS.** The misleading
> `"legacy — Phase 7 backfills tool"` placeholder was retired from the 7 files whose resolution is a
> reason-swap (no new tool): the **4 Auth forms** → `"pre-app auth (not agent-driven)"` (§5), and the
> **3 primitive test fixtures** (Button/IconButton/TextField) → `"test fixture"`. Verified tsc 0,
> 48 affected tests green, drift `refs OK`. **Remaining — the 4 files that need real tools:**
> SignUpWidget (`submit_signup` §1), OnboardingWizard (4 nav tools §2), GateChatRail (wire to the
> existing gate tool §3), DialogTitle (`close_dialog` §4) + guard widening (§6) + inert-trio docs
> (§7). Each new tool = intent variant + orchestrator handler + `tools.ts` + catalog mirror + test.

## 1. SignUpWidget → real tool

- [ ] **Failing test:** `SignUpWidget.tools.test.ts` — exports a `submit_signup`
      mutate tool (zod args: email + any sign-up fields); valid schema.
- [ ] Add `submit_signup` CanvasIntent variant + orchestrator handler (mutate →
      chip + user-confirm path, per design §C).
- [ ] Build `SignUpWidget.tools.ts`; delete `SignUpWidget/no-llm.md`.
- [ ] Submit Button → `tool="submit_signup"`; the 5 TextFields → `noTool`
      with honest reason `"value collected by submit_signup"`.
- [ ] Mirror `submit_signup` in `middleware/services/toolCatalog.ts`.

## 2. OnboardingWizard → nav tools

- [ ] **Failing test:** wizard nav tools (`wizard_next`, `wizard_back`,
      `wizard_finish`, `dismiss_wizard`) exist + dispatch the right CanvasIntent.
- [ ] Add the 4 intents + orchestrator handlers (read-style → auto-dispatch).
- [ ] Wire the 4 Buttons to their tools; catalog mirror.

## 3. GateChatRail stray Button

- [ ] **Failing test:** the stray Button references the existing gate tool
      (`commit_gate` or `dismiss_gate`) — no new tool, no `noTool`.
- [ ] Wire it.

## 4. DialogTitle close → close_dialog

- [ ] **Failing test:** the close IconButton carries `tool="close_dialog"`.
- [ ] Add `close_dialog` intent + handler + catalog mirror.

## 5. Auth forms — honest noTool

- [ ] Replace the 4 placeholder reasons (`"legacy — Phase 7 backfills tool"`)
      with `"pre-app auth — not agent-driven"` in Login / Register /
      ConfirmChangePassword / VerificationEmail forms.
- [ ] (No tool — decided 2026-05-28.)

## 6. Widen the binding guard

- [ ] **Failing test:** `check-tool-references.test.mjs` — an interactive
      `DropdownMenu` item / `GxPill` with `onClick` / `GxSectionHeader` with
      `onClick` that lacks `tool|noTool` fails the guard.
- [ ] Extend `check-tool-references.mjs` enforcement set beyond
      Button/IconButton/TextField to those interactive surfaces.
- [ ] Resolve every newly-flagged site (real tool or honest `noTool`).

## 7. Sanctioned-inert trio

- [ ] Document in `widget-contract.md`: `ThinkingStream`, `SuggestedActionChips`,
      `ChatColumn` keep `no-llm.md` with an explicit "why no tool" — the named
      exceptions to "every widget needs a tool."
- [ ] Update each `no-llm.md` with the real rationale (replace any boilerplate).

## Closure

- [ ] No `noTool` with the `"legacy — Phase 7 backfills tool"` placeholder remains
      anywhere (grep clean).
- [ ] App + middleware suites green; tsc both sides; drift guards green
      (`check-tool-references`, `check-tool-quality`, `widget-contract`).
- [ ] OpenSpec `validate --all --strict`.
- [ ] Chrome DevTools MCP smoke: the LLM-driven flows for the new tools fire
      (e.g. ask the agent to advance the wizard / submit sign-up → chip → intent).
- [ ] Archive.
