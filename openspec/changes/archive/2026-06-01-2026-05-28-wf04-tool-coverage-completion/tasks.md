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

## 1. SignUpWidget → real tool — DELIVERED by `tool-system-completion`

- [x] **Failing test:** `SignUpWidget.tools.test.ts` — exports a `submit_signup`
      mutate tool (zod args: email + any sign-up fields); valid schema.
      (delivered by tool-system-completion / app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.tools.test.ts)
- [x] Add `submit_signup` CanvasIntent variant + orchestrator handler (mutate →
      chip + user-confirm path, per design §C).
      (delivered by tool-system-completion / SignUpWidget.tools.ts:29 `category: "mutate"`)
- [x] Build `SignUpWidget.tools.ts`; delete `SignUpWidget/no-llm.md`.
      (delivered by tool-system-completion / app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.tools.ts:29; no `no-llm.md` in that dir)
- [x] Submit Button → `tool="submit_signup"`; the 5 TextFields → `noTool`
      with honest reason `"value collected by submit_signup"`.
      (delivered by tool-system-completion / SignUpWidget.tsx:332 Button + 269/279/290/304/316 TextFields)
- [x] Mirror `submit_signup` in `middleware/services/toolCatalog.ts`.
      (delivered by tool-system-completion / middleware/src/services/toolCatalog.ts:590)

## 2. OnboardingWizard → nav tools — DELIVERED by `tool-system-completion`

- [x] **Failing test:** wizard nav tools (`wizard_next`, `wizard_back`,
      `wizard_finish`, `dismiss_wizard`) exist + dispatch the right CanvasIntent.
      (delivered by tool-system-completion / app/src/views/Onboarding/OnboardingWizard.tools.test.ts; 8 tests green)
- [x] Add the 4 intents + orchestrator handlers (read-style → auto-dispatch).
      (delivered by tool-system-completion / OnboardingWizard.tools.ts:27/37/47/57, all `category: "read"`)
- [x] Wire the 4 Buttons to their tools; catalog mirror.
      (delivered by tool-system-completion / OnboardingWizard.tsx:103/104/108/112; mw mirror toolCatalog.ts:619/630/641/652)

## 3. GateChatRail stray Button — RE-SCOPED + RESOLVED

- [x] **Re-scope (2026-06-01):** the §3 banner premise ("0 `<Button>` after the
      unified-conversation-flow rewrite") was WRONG. One `<Button>` survived in
      `GateChatRail.tsx` carrying the `"legacy — Phase 7 backfills tool"`
      placeholder — the committed-state "Continue to Integrate" CTA
      (`gate-rail-continue-integrate`). It is onboarding-FLOW nav chrome
      (advances f7), NOT a gate action and NOT agent-driven: the gate is already
      committed when it renders, and the existing test (GateChatRail.test.tsx:169)
      already documents it as "onboarding-FLOW chrome, not a role affordance."
- [x] Resolved with an honest `noTool="onboarding-flow nav chrome (not agent-driven)"`
      (NOT the gate tool — it isn't a gate action). GateChatRail.tsx:291.
      The two real gate CTAs already carry `tool="commit_gate"` (lines 355/366).

## 4. DialogTitle close → close_dialog — DELIVERED by `tool-system-completion`

- [x] **Failing test:** the close IconButton carries `tool="close_dialog"`.
      (delivered by tool-system-completion / DialogTitle.tsx:56 `<IconButton tool="close_dialog" …>`)
- [x] Add `close_dialog` intent + handler + catalog mirror.
      (delivered by tool-system-completion / DialogTitle.tools.ts:21; mw mirror toolCatalog.ts:663)

## 5. Auth forms — honest noTool — DONE

- [x] Replace the 4 placeholder reasons (`"legacy — Phase 7 backfills tool"`)
      with an honest reason in Login / Register / ConfirmChangePassword /
      VerificationEmail forms. Shipped as `"pre-app auth (not agent-driven)"`
      (LoginForm.tsx:71/89, RegisterForm.tsx:75/76/109,
      ConfirmChangePasswordForm.tsx:46/54, VerificationEmailForm.tsx:32).
      Spec text says `"pre-app auth — not agent-driven"`; the shipped phrasing is
      the parenthetical variant — both are specific + truthful (the placeholder
      is gone), which is the substantive requirement.
- [x] (No tool — decided 2026-05-28.)

## 6. Widen the binding guard — DONE (2026-06-01)

- [x] **Failing test:** `check-tool-references.test.mjs` Test 5 (a–f) — a
      `GxPill` with `onClick` and no `tool|noTool` fails (5a) and is named in
      stderr; decorative `GxPill` without `onClick` passes (5b); bound
      `GxPill(onClick)` passes (5c); `DropdownMenu` with no binding fails (5d) /
      with `noTool` passes (5e); `GxSectionHeader(onClick)` unbound fails (5f).
      Confirmed RED before the script change (6 assertions failed), GREEN after.
- [x] Extend `check-tool-references.mjs` beyond the type-level
      `_tool-binding.ts` union (which already hard-requires Button / IconButton /
      TextField / PasswordField at compile time) to the three surfaces NOT in
      that union: `DropdownMenu` (always interactive), `GxPill` + `GxSectionHeader`
      (interactive only with `onClick`). New `checkBindingCoverage()` parses each
      opening tag and requires `tool=` or `noTool=`.
- [x] Resolve every newly-flagged site. **Zero consumer call sites exist today**
      for these three surfaces (grep of `app/src` for `<DropdownMenu` /
      `<GxPill` / `<GxSectionHeader` outside their own dir + tests = none), so the
      guard widening is purely forward-binding — a future clickable use cannot
      ship unbound. No new `submit_`/`wizard_`/`close_` tool was needed (those
      prerequisites already landed via tool-system-completion). Guard green on the
      real tree (exit 0).

## 7. Sanctioned-inert trio — DONE (2026-06-01)

- [x] Document in `widget-contract.md`: `ThinkingStream`,
      `SuggestedActionChips`, `ChatColumn` are the named sanctioned tool-less
      exceptions. Added a "Sanctioned tool-less widgets — the inert trio" section
      (table + "adding a fourth is a contract change" rule) referencing the
      `app-architecture` spec requirement. (docs/agents/widget-contract.md)
- [x] Update each `no-llm.md` with the real rationale. **Already done** — the
      banner premise ("the `no-llm.md` files don't exist") was WRONG; all three
      exist (`ThinkingStream/`, `SuggestedActionChips/`, `ChatColumn/no-llm.md`)
      and each already carries a specific `## Why` (decorative reveal / chip
      renderer for router-returned actions / chat surface that would loop on
      `send_message`) — not boilerplate. No edit needed.

## Closure

- [x] No `noTool` with the `"legacy — Phase 7 backfills tool"` placeholder remains
      anywhere (grep clean). The last survivor (GateChatRail.tsx:291) was resolved
      in §3 (2026-06-01). Grep of `app/src` + `middleware/src` = 0 matches.
- [x] App + middleware suites green; tsc both sides; drift guards green
      (`check-tool-references`, `check-tool-quality`, `widget-contract`).
      App vitest: 1495/1496 (the 1 fail is a pre-existing parallel-load flake in
      `SchemaView.test.tsx` `amount_due` formatting — passes in isolation,
      unrelated to this change's files). Middleware: 690/690. `npm run build`
      (tsc + vite) exit 0. `check-tool-references` + `check-tool-quality` +
      their self-tests + `widget-contract.test.ts` all green.
- [x] OpenSpec `validate 2026-05-28-wf04-tool-coverage-completion --strict` → valid.
- [x] The two banner prerequisites had ALREADY landed via the archived
      `tool-system-completion` change (Prereq 1: `submit_`/`wizard_`/`close_` in
      `ALLOWED_VERBS` — check-tool-quality.mjs:46/64-66; Prereq 2: registry +
      quality glob extended to `views/**` + `components/primitives/**` —
      registry.ts:106-123), and §1/§2/§4 shipped there. This change's residual
      runnable scope (§3 placeholder, §6 guard widening, §7 docs) is now complete.
      **Archive-ready** (orchestrator to run `openspec archive`).

## DEFERRED closure — RESOLVED (prerequisites + §1/§2/§4 already landed elsewhere)

- [x] Prereq 1: `submit_` / `wizard_` / `close_` added to `ALLOWED_VERBS`.
      (delivered by tool-system-completion / check-tool-quality.mjs:64-66)
- [x] Prereq 2: registry + quality glob extended to a view/primitive tool home.
      (delivered by tool-system-completion / registry.ts:106-123 + check-tool-quality.mjs/check-tool-references.mjs TOOL_HOMES)
- [x] §1/§2/§4 tools built (delivered by tool-system-completion — see §1/§2/§4
      above). Chrome DevTools MCP smoke not re-run here: the tools' unit + catalog
      mirror tests are green and the flows are wired (no dormant plumbing).
- [ ] Archive. — left for the orchestrator (HARD RULE: this pass does not archive).
