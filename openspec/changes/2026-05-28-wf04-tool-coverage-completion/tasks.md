# Tasks — WF-04 complete tool coverage

> **Partially BACKLOGGED (2026-05-30):** the new `submit_` / `wizard_` / `close_`
> tools (§1, §2, §4) are blocked and deferred. Two prerequisites must land first:
> 1. **Verb-allowlist entries** — add `submit_` / `wizard_` / `close_` to
>    `ALLOWED_VERBS` in `app/scripts/check-tool-quality.mjs` (lines 35-54); only
>    `dismiss_` from that family passes today.
> 2. **A glob-home for view/primitive tools** — the registry
>    (`app/src/tools/registry.ts`, glob lines 90-93) and the quality scanner
>    (`collectToolFiles`, lines 56-82) walk only `chat-widgets/*/*.tools.ts` +
>    `viewer-widgets/*/*.tools.ts`; `OnboardingWizard` (a view) and `DialogTitle`
>    (a primitive) have no glob home.
>
> **FULLY BACKLOGGED (2026-05-31) — premises stale after the architecture run.** The
> "runnable cleanup" (§3/§6/§7) no longer applies as written: §3's GateChatPanel stray-Button
> target is gone (0 `<Button>` after the unified-conversation-flow rewrite); §6's binding-guard
> test does not exist by that name; §7's `DropdownMenu`/`GxPill`/`GxSectionHeader` `no-llm.md`
> files don't exist. The codebase moved substantially under this change (unified flow, ScopedCanvas,
> smart-report). **Do NOT run as-is.** Before any future pickup, RE-SCOPE §3/§6/§7 against current
> code (most is likely obsolete) and reconfirm the §1/§2/§4 prerequisites (verb-allowlist + glob-home).
> Tracked in `docs/agents/cross-plan-execution-order.md` backlog. (§5 Auth honest `noTool` already done.)
>
> _(prior note:)_ §5 done; §1/§2/§4 + the new-tool parts of §6 were already deferred behind the
> verb-allowlist + glob-home prerequisites.

> **Progress 2026-05-29: census cleanup DONE; tool-building REMAINS.** The misleading
> `"legacy — Phase 7 backfills tool"` placeholder was retired from the 7 files whose resolution is a
> reason-swap (no new tool): the **4 Auth forms** → `"pre-app auth (not agent-driven)"` (§5), and the
> **3 primitive test fixtures** (Button/IconButton/TextField) → `"test fixture"`. Verified tsc 0,
> 48 affected tests green, drift `refs OK`. **Remaining — the 4 files that need real tools:**
> SignUpWidget (`submit_signup` §1), OnboardingWizard (4 nav tools §2), GateChatRail (wire to the
> existing gate tool §3), DialogTitle (`close_dialog` §4) + guard widening (§6) + inert-trio docs
> (§7). Each new tool = intent variant + orchestrator handler + `tools.ts` + catalog mirror + test.

## 1. SignUpWidget → real tool — DEFERRED (blocked on `submit_` verb + view/primitive glob-home; see banner)

- [ ] **Failing test:** `SignUpWidget.tools.test.ts` — exports a `submit_signup`
      mutate tool (zod args: email + any sign-up fields); valid schema.
- [ ] Add `submit_signup` CanvasIntent variant + orchestrator handler (mutate →
      chip + user-confirm path, per design §C).
- [ ] Build `SignUpWidget.tools.ts`; delete `SignUpWidget/no-llm.md`.
- [ ] Submit Button → `tool="submit_signup"`; the 5 TextFields → `noTool`
      with honest reason `"value collected by submit_signup"`.
- [ ] Mirror `submit_signup` in `middleware/services/toolCatalog.ts`.

## 2. OnboardingWizard → nav tools — DEFERRED (blocked on `wizard_` verb + view glob-home; see banner)

- [ ] **Failing test:** wizard nav tools (`wizard_next`, `wizard_back`,
      `wizard_finish`, `dismiss_wizard`) exist + dispatch the right CanvasIntent.
- [ ] Add the 4 intents + orchestrator handlers (read-style → auto-dispatch).
- [ ] Wire the 4 Buttons to their tools; catalog mirror.

## 3. GateChatRail stray Button

- [ ] **Failing test:** the stray Button references the existing gate tool
      (`commit_gate` or `dismiss_gate`) — no new tool, no `noTool`.
- [ ] Wire it.

## 4. DialogTitle close → close_dialog — DEFERRED (blocked on `close_` verb + primitive glob-home; see banner)

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
- [ ] Resolve every newly-flagged site. Active now: sites resolvable to an
      *existing* tool or an honest `noTool`. DEFERRED: any site that would need a
      new `submit_`/`wizard_`/`close_` tool (blocked on the two prerequisites in
      the banner).

## 7. Sanctioned-inert trio

- [ ] Document in `widget-contract.md`: `ThinkingStream`, `SuggestedActionChips`,
      `ChatColumn` keep `no-llm.md` with an explicit "why no tool" — the named
      exceptions to "every widget needs a tool."
- [ ] Update each `no-llm.md` with the real rationale (replace any boilerplate).

## Closure (runnable scope only — does NOT gate on the deferred §1/§2/§4)

- [ ] No `noTool` with the `"legacy — Phase 7 backfills tool"` placeholder remains
      anywhere (grep clean).
- [ ] App + middleware suites green; tsc both sides; drift guards green
      (`check-tool-references`, `check-tool-quality`, `widget-contract`).
- [ ] OpenSpec `validate --all --strict`.
- [ ] Do NOT archive until the two banner prerequisites land and §1/§2/§4 ship —
      the change stays open carrying the deferred work.

## DEFERRED closure (re-activates once the two prerequisites land)

- [ ] Prereq 1: `submit_` / `wizard_` / `close_` added to `ALLOWED_VERBS`.
- [ ] Prereq 2: registry + quality glob extended to a view/primitive tool home.
- [ ] §1/§2/§4 tools built; Chrome DevTools MCP smoke: the LLM-driven flows fire
      (advance the wizard / submit sign-up → chip → intent).
- [ ] Archive.
