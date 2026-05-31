# Tasks — Unified conversation flow + pluggable chat experiences

> Goal: ONE durable conversation engine + view; onboarding (and future Workspace/Project entries) are
> an OPTIONAL `ChatExperience` selected by composition (no mode, no entry context), never forked flow components. Behavior-
> preserving at the user level; `ChatColumn.test` is RETARGETED in Phase 2 (testids lose the
> `onboarding-`/`steady-` prefixes → `chat-live-*`, the `mode="steady"` render-prop is removed; ~50
> `expect(...)` testid assertions updated across ~9 `mode="steady"` mount sites) — it is NOT preserved
> verbatim. Phase 1 keeps it green (pure dedup). WIP cap = 3.
>
> **Execution: → SEQUENTIAL/TDD.** Coupled refactor of a live surface; each phase changes a contract the
> next builds on. Not a fan-out.
>
> **Dependencies / ordering:**
> - Phase 1 (extract `useConversation`) has NO external dependency — safe to start anytime.
> - Phase 2 removes `ChatColumn`'s flow `mode`. `ChatColumn` is a contract widget, and the
>   widget-contract guard requires the role/mode prop — so **widget-role-access MUST land first or
>   together**: it flips the guard to require `role`, and `ChatColumn` then carries `role` (forwarded to
>   its children), not the deleted flow `mode`.
> - Phase 2's `chatExperienceRegistry` implements the shared `Catalog<T>` from
>   registry-catalog-consistency Phase 1, so **that Phase 1 lands before this Phase 2** (it's ~a type +
>   a helper). No "local then shared" interim contract.

## Phase 1 · Extract the durable engine `useConversation` (pure dedup, no structural change)
- [ ] **Failing test:** a `useConversation` engine round-trips a send (optimistic user turn → assistant turn with citations/suggestedActions) and projects `activeChatSession.messages` → `liveTurns`; `isOnboarding` is read from the session, not hardcoded.
- [ ] Extract `useConversation(chatSessionId, { onFirstUserSend? })` — `liveTurns` state + projection effect + `send` + `handleSuggestedAction` + `seedTurns` + lifecycle callbacks. Point BOTH `SteadyConversationFlow` and `F2ConversationFlow` at it (delete their copied internals; keep their distinct headers/choreography inline for now). NO frame/script imports in the hook. Both app + middleware suites green. *(Safe stopping point — pure dedup.)*

## Phase 2 · One `<ConversationFlow>` + the optional `ChatExperience`; delete the forks + all modes
- [ ] **Failing test:** `<ConversationFlow chatSessionId>` with NO experience renders the bare chat (input + turns, `chat-live-*` testids); with `makeOnboardingExperience(...)` it renders the scripted intro + pick-views and the f3/f5 auto-advance fires via the experience's `Choreography` (the existing auto-advance assertions, retargeted).
- [ ] Add `ChatExperience` — **all fields optional**: `{ Intro?:FC<{conversation}>, seedTurns?, Choreography?:FC<{conversation}>, onFirstUserSend? }` (identity lives on the catalog ENTRY, not here). Selected by composition (the mount site constructs + passes one, or nothing). `Intro`/`Choreography` are **components** (Rules-of-Hooks-safe when the experience is absent).
- [ ] Build `makeOnboardingExperience({ scenarioId, thinkingScript })` (a factory closing over its config): `Intro` = scripted `ThinkingStream` + pick-view pills (`derivePickViews`); `Choreography` = render-null `FC` (uses `useOnboardingSession`) firing `advanceFrame("f3")` on intro-done + `advanceFrame("f5")` on first send.
- [ ] **Failing test:** `chatExperienceRegistry.byId("onboarding")` returns the entry; `.create({...})` yields a `ChatExperience`; `all()` lists it; a duplicate id throws at build. The catalog exposes ONLY `all()`/`byId()` (no `resolve(context)` method).
- [ ] Add `chatExperienceRegistry` — a `Catalog<ChatExperienceEntry>` (`{ id, label?, configSchema (Zod), create }`), glob-discovered from `app/src/conversation/experiences/<id>/experience.ts` (OUTSIDE the widget slots, so the widget-contract drift guard does not apply), with a unique-id invariant via `assertUniqueIds`, mirroring `toolRegistry`'s assembly + `ScenarioRegistry`'s `byId` API. Register the onboarding entry. The catalog is lookup/enumerate ONLY — no entry-context resolver. *(Imports the shared `Catalog<T>` + `assertUniqueIds` from registry-catalog-consistency Phase 1 — a prerequisite; declaring this registry as a `Catalog` implementer there is that change's Phase 4.)*
- [ ] Implement `<ConversationFlow chatSessionId experience?>` (**no `mode`, no `entry`**; engine + optional Intro header + `<LiveTurnList>` (mode prop dropped) + `<LiveChatInputBar>` + optional Choreography). `ChatColumn` looks the onboarding experience up via `chatExperienceRegistry.byId("onboarding")?.create({...})` in-journey (else none) and passes it; **delete `SteadyConversationFlow` + `F2ConversationFlow` and remove the `mode` param + all steady/onboarding branching**. Gate + F1/BYO placeholders unchanged. `ChatColumn.test` is RETARGETED (testids → `chat-live-*`; the `mode` param + `steady-`/`onboarding-` prefixes removed; ~50 `expect(...)` testid assertions updated across ~9 `mode="steady"` mount sites), not preserved verbatim. *(The per-widget `mode` contract on `SuggestedActionChips`/`ProposeSchemaFieldCard` is a separate axis — supply it from auth/gate state, not a flow mode; the broader "replace widget `mode` with the experience model" question is out of scope — see design note.)*

## Phase 3 · Remove the mount-persistence hack
- [ ] **Failing test:** `liveTurns` persist across an onboarding frame advance (f2→f3→f5) — i.e. the conversation is NOT remounted/wiped.
- [ ] Delete the `ChatColumnInner` "keep mounted across F2→F5" routing hack + its comment (`:172`); rely on the single always-mounted `ConversationFlow`.

## Closeout
- [ ] `validate --all --strict` green; app + middleware suites green; widget-contract + no-hardcoded-styles guards green; `npm run build` clean.
- [ ] Update `docs/agents/data-model.md` (or an architecture note) + memory (`feedback_no_onboarding_duplicates` — chat is now literally one flow + an experience layer).
- [ ] Archive.

## Deferred (tracked, NOT this change)
- [ ] **One shared main view across both shells** (needs its own OpenSpec change when scheduled): `OnboardingShell` adopts the same `AppShell` (`nav`+`chat`+`canvas`) that `SteadyShell` already uses, with the canvas driven by the active experience's `ContentScope` + viewer step (the `ScopedViewerWidget` set), replacing its bespoke per-frame `canvasContent` switch over `UnderstandView`/`ExtractView`/`InteractView`/`IntegrateView`. Shells stay separate (per-context chrome + entry points); only the VIEW is shared. Touches `OnboardingShell`, `AppShell`, core-data `ScopedViewerWidget`, and the `real-data-rewire-gap` fold. See `docs/agents/real-data-rewire-gap.md` §"One main view".
- [ ] **Wire entry points → experiences**: the authenticated nav rail's Workspaces/Projects entries (today disabled stubs in `OnboardingNav`) compose `makeWorkspaceExperience({ scope })` / `makeProjectExperience({ scope })` / a document(+filter) experience; the onboarding overlay composes the onboarding experience. (Authoring those experiences below.)
- [ ] Author the **Workspace** + **Project** experiences (`makeWorkspaceExperience({ scope })` / `makeProjectExperience({ scope })`, each closing over its own `ContentScope`); this change only ships the engine + abstraction + the onboarding reference experience.
- [ ] Per-entry **session selection/creation** (which `chat_sessions` row a Workspace/Project entry uses) — consumes the existing active session for now.
- [ ] Collapse the remaining onboarding placeholders (Idle/BYO/Gate) into the experience model if it proves cleaner (gate stays an overlay for now).
- [ ] **Widget-contract rule 5 (dependency direction) — enforce + fix the one violation (adversarial review 2026-05-30).** `widget-contract.test.ts` does NOT enforce rule 5 (a widget SHALL NOT import from `views/` or another widget slot) — there is only an "implicit carve-out" comment. Live violation: `chat-widgets/ChatColumn/ChatColumn.tsx:81` imports `GateChatPanel` from `@/views/Onboarding/` and renders it at `if (gateActive) return <GateChatPanel/>` (`:189`) — a widget→view→widget layering inversion (`GateChatPanel` imports `GateChatRail` back from `chat-widgets/`). This IS the gate flow-dispatch this change reworks. When the ChatColumn rewrite (Phase 2) + gate-overlay handling land: (a) untangle the gate-panel mount so `ChatColumn` no longer imports from `views/` (move the gate composite into `chat-widgets/`, or hoist the `gateActive` branch to the host); then (b) add a **rule-5 dependency-direction assertion** to the widget-contract guard — it can only go green once (a) is done, which is why it's tracked here and not added now.
