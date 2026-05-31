# Tasks — Widget-contract rule 5 (dependency direction) + ChatColumn untangle

> TDD, failing-test-first. The untangle (Phase 1) MUST land before the rule-5 assertion
> (Phase 2) can go green — Phase 2's test is red against today's inverted import on purpose, so
> it is authored failing-first but only passes once Phase 1 is merged. Sequential: every task
> touches `ChatColumn.tsx`, the gate composite, or the shared `widget-contract.test.ts`. No
> fan-out. Adversarial review gate after each phase.

## Phase 0 — Decision gate

- [x] **INPUT NEEDED:** Confirm the untangle approach: MOVE the gate composite into
      `components/chat-widgets/GateChatPanel/` (proposal default — it is a chat composite that
      already mounts the `GateChatRail` chat-widget), OR instead HOIST the `gateActive` branch up
      to the host (`OnboardingShell`) so `ChatColumn` never references the gate at all. Default =
      MOVE. This gates Phase 1.

> — DONE (Phase 0): chose **MOVE** (proposal default). cross-plan-execution-order names ChatColumn as
> the sole rule-5 violation owned here; the second inversion (`Extract` → `SchemaView`) is owned by
> step 20 (onboarding-shell view retirement) and is carried as a sanity-checked allowlist entry.

## Phase 1 — Untangle ChatColumn (lands first)

- [x] Write a failing test asserting the gate composite lives in the chat-widget slot: a test that
      `components/chat-widgets/GateChatPanel/GateChatPanel.tsx` exists AND that
      `ChatColumn.tsx` imports `GateChatPanel` from `@/components/chat-widgets/...`, NOT from
      `@/views/`. Confirm it is red today.
- [x] Move `views/Onboarding/GateChatPanel.tsx` → `components/chat-widgets/GateChatPanel/GateChatPanel.tsx`,
      carrying its local helpers (`useGateComposedPersisted`, `COMPOSED_STORAGE_KEY_PREFIX`,
      `COMPOSING_DELAY_MS`, `TYPING_COPY`, `IdleChatPlaceholder`, `TypingIndicator`). Keep behavior
      byte-for-byte; only the file home changes.
- [x] Add `role: WidgetRole` + `scope: WidgetScope` props to the moved `GateChatPanel` (gate context
      is anonymous-only, session-scoped → `scope = { type: "none" }`) to satisfy widget-contract
      rules 1–4. ChatColumn already mounts `GateChatRail` with `role="anonymous" scope={{type:"none"}}`
      inside the composite — keep that.
- [x] Add `components/chat-widgets/GateChatPanel/README.md` with the rule-3 section headers (What it
      does / Props / Locked affordances / Events / How to mount / LLM tools).
- [x] Move `views/Onboarding/GateChatPanel.test.tsx` →
      `components/chat-widgets/GateChatPanel/GateChatPanel.test.tsx`; fix import paths; keep coverage.
- [x] Update `ChatColumn.tsx:44` import to `@/components/chat-widgets/GateChatPanel/GateChatPanel`
      and pass `role`/`scope` at the `<GateChatPanel/>` mount site (`:111`).
- [x] Update the doc-comment references to `GateChatPanel` in `views/Onboarding/OnboardingShell.tsx`
      (`:134`, `:252`, `:660`) so they point at the chat-widget home.
- [x] Run `npm run build` + the full app test suite + the widget-contract suite; confirm Phase 1's
      placement test is now green and the gate flow renders identically (open → typing →
      `GateChatRail`, committed success card, dismiss). No user-visible delta.
- [x] Adversarial review gate (Phase 1): grep for ANY remaining `@/views/` import under
      `components/chat-widgets/` + `components/viewer-widgets/`; confirm zero. Confirm no orphaned
      `views/Onboarding/GateChatPanel*` files remain. Confirm the moved test is real + green + not
      retargeted to a trivial assertion.

> — DONE (Phase 1): `GateChatPanel` moved to `components/chat-widgets/GateChatPanel/` (.tsx + README.md
> + no-llm.md + sibling .test.tsx, role/scope props added, behavior byte-for-byte). ChatColumn imports
> it from the slot and mounts `<GateChatPanel role="anonymous" scope={{type:"none"}} />`. OnboardingShell
> doc-comments + GateChatRail README updated; widget-access-matrix gains GateChatPanel rows (§1 + §1b).
> Old view files deleted. Placement test `src/test/gate-chat-panel-placement.test.ts` proven red-then-green.
> Grep confirms zero `@/views/` imports under either widget slot; no orphaned files. Build + full app
> suite (1388) + middleware (598) green.

## Phase 2 — Widget-contract rule 5 (dependency-direction assertion)

- [x] Write the failing rule-5 assertion in `app/src/test/widget-contract.test.ts`: for every widget
      under `chat-widgets/` + `viewer-widgets/`, scan each `.ts`/`.tsx` source (excluding `*.test.*`)
      for import specifiers; FAIL if any resolves to `@/views/` (or a relative path climbing into
      `views/`) OR into the *other* widget slot. Allow within-slot widget→widget imports
      (`ChatColumn` → `GateChatPanel` → `GateChatRail`). Author this against today's tree FIRST and
      confirm it would have been red pre-Phase-1 (cite the `ChatColumn`→`views/Onboarding` import as
      the proof case); with Phase 1 merged it is green.
- [x] Label the assertion "rule 5" consistent with the existing rule-1..4 numbering in the file, and
      give it an actionable failure message naming the offending file, the offending specifier, and
      the widget-contract.md §235 reference.
- [x] Promote `docs/agents/widget-contract.md` §235 "Dependency rule" to an explicit, test-backed
      rule 5: state widgets import only `brand/ · primitives/ · layout/` and (within their own slot)
      sibling widgets — never `views/` and never the other widget slot — and cross-link the test.
- [x] Run the widget-contract suite + `npm run build`; confirm rule 5 is green and the existing
      rules 1–4 still pass for the moved `GateChatPanel`.
- [x] Adversarial review gate (Phase 2): falsify the assertion against code — temporarily reintroduce
      a `@/views/` import in a scratch widget source and confirm rule 5 goes red (no-op-guard check);
      confirm the regex/path resolution catches both alias (`@/views/`) and relative (`../../views/`)
      forms; confirm within-slot widget→widget is NOT flagged. Run `openspec validate
      2026-05-31-dependency-direction-guard --strict`.

> — DONE (Phase 2): rule-5 assertion added to `app/src/test/widget-contract.test.ts` ("rule 5 —
> dependency direction") — walks every non-test `.ts`/`.tsx` under both slots, fails on imports
> resolving into `views/` (alias `@/views/` OR relative climb) or into the other widget slot;
> within-slot widget→widget allowed; actionable message names file + specifier + §235. Red-on-injection
> proven via a scratch viewer-widget source exercising all three forms (alias view, relative view,
> other-slot), then removed. A sanity-checked `KNOWN_VIEW_IMPORT_ALLOWLIST` (mirrors no-hardcoded-styles
> ASSET_ALLOWLIST) tolerates the step-20-owned `Extract`→`SchemaView` import and fails if it goes stale.
> widget-contract.md §235 promoted to test-backed rule 5. widget-contract suite (164) green; rules 1–4
> still pass for the moved GateChatPanel; `npm run build` clean; `openspec validate ... --strict` clean.
