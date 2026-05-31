# Unified conversation flow + pluggable chat experiences

## Why

`ChatColumn` currently forks the live chat into **two near-duplicate flow components** —
`SteadyConversationFlow` and `F2ConversationFlow` (onboarding) — that each re-implement the same
engine (`liveTurns` state, the `activeChatSession.messages` → `liveTurns` projection effect, `send`
+ optimistic turns, `handleSuggestedAction`, the per-turn render). Verified diff: the engines are
identical except (1) an `isOnboarding` flag that should come from the session, (2) two
`advanceFrame(...)` calls, and (3) F2 rendering a scripted intro / `ThinkingStream` + pick-view pills
*above* the thread. So the onboarding-specific parts are pure **decoration** (rendered above) +
**choreography** (reacting to chat events) — none of it changes the chat engine.

This is backwards: onboarding is **1–2 hours of a multi-year account**, yet the ephemeral onboarding
flow is the larger, primary-looking component and the durable steady chat is a stripped copy. It also
violates the locked **`no-onboarding-duplicates`** rule (chat = ONE production widget; onboarding is a
mode/overlay, same code path).

**Generalization (the real requirement):** directing the *initial* conversational experience is not
onboarding-specific. Entering chat from a nav element — **Workspace**, **Project** — should be able to
inject its own scripted intro / seed / affordances. Onboarding is just one such directed experience.
So we want ONE durable conversation engine, and an **optional, pluggable `ChatExperience`** that the
mounting surface composes in for *how the user entered chat* — no modes, no entry-context object.
Onboarding becomes the reference experience, not a fork.

## What

- **`useConversation(chatSessionId)`** — the single, durable, experience-agnostic chat engine
  (state + projection + `send` (reads `isOnboarding` from the session) + `handleSuggestedAction`), emitting
  lifecycle events (`onFirstUserSend`, intro-complete, turn-added). Never imports `advanceFrame`/frames/scripts.
- **`<ConversationFlow chatSessionId experience? >`** — the single chat view. **No `mode`** — with no
  `experience` it IS the plain chat (what used to be "steady"). Renders `experience.Intro` (header) +
  `<LiveTurnList>` + `<LiveChatInputBar>` + `experience.Choreography`.
- **`ChatExperience`** — an OPTIONAL directed-experience descriptor with **every field optional**:
  `{ Intro?: FC, seedTurns?, Choreography?: FC, onFirstUserSend? }` (identity is on the catalog entry,
  not the experience). `Intro`/`Choreography` are
  **components** (not bare hooks) so they're Rules-of-Hooks-safe even when the experience is absent.
  `Choreography` is render-null and uses whatever contexts it needs (`useOnboardingSession`, navigation)
  to react to engine events.
- **Selected by composition.** The surface that mounts the chat constructs the experience it wants (or
  passes none). Each experience is a **factory closing over its own typed config** —
  `makeOnboardingExperience({ scenarioId, thinkingScript })`, `makeWorkspaceExperience({ scope: ContentScope })`.
  Need to scope chat to a workspace/project? That's the experience's own config, not a flow concept. The
  `Intro`/`Choreography` get only `{ conversation }`.
- **`chatExperienceRegistry` — a data catalog** (consistent in API + style with `ScenarioRegistry` and
  `toolRegistry`): `Catalog<ChatExperienceEntry>` with `all()` + `byId(id)`, local glob-discovered,
  unique-id invariant. Each entry = `{ id, label?, configSchema (Zod), create(config) }`. The catalog
  **lists and looks up** experiences; the caller composes (picks the id, supplies config, passes the
  result). It is NOT a resolver — it never takes an entry-context and auto-mounts. *(A registry-as-resolver
  driven by an entry-context was considered and rejected; the catalog is lookup-only — see design.md §3a +
  "vs alternatives".)*
- **Onboarding re-expressed** as `makeOnboardingExperience(...)` (Intro = scripted `ThinkingStream` +
  pick-view pills; Choreography = `advanceFrame("f3")` on intro-done, `advanceFrame("f5")` on first send).
  The two forked flow components — and all steady/onboarding `mode` branching — are **deleted**.

## Conformance to core architectural decisions

- **`no-onboarding-duplicates`**: chat is now literally one production flow; onboarding is an injected
  experience, same engine/code path. Directly enforces the rule for the chat surface.
- **Composition**: an experience is constructed + passed by the mounting surface (a factory closing
  over its config), aligning with how the app already wires behavior at mount sites.
- **Catalog consistency**: `chatExperienceRegistry` is a data catalog matching the existing catalogs'
  API + style (`ScenarioRegistry`, `toolRegistry`) — `all()`/`byId()`, unique-id invariant. The shared
  `Catalog<T>` contract + harmonizing the existing catalogs is a SEPARATE change (registry-catalog-consistency).
- **`ContentScope` reuse**: a scoped experience (e.g. Workspace/Project) closes over the shared
  `ContentScope` as its own config — no flow-level scope/context concept.
- **Kills a hack**: the "keep chat mounted across F2→F5 so auto-advance doesn't wipe `liveTurns`"
  routing hack (`ChatColumnInner:172`) disappears — one always-mounted `ConversationFlow` makes
  persistence structural, not careful-routing.

## Out of scope

- Authoring real **Workspace/Project** experiences (this change ships the engine + the optional
  `ChatExperience` abstraction + the **onboarding** experience as the reference; Workspace/Project
  experiences are follow-on, enabled by this).
- Session selection/creation per entry source (which `chat_sessions` row a Workspace entry uses) —
  tracked separately; this change consumes the already-active session.
- Smart-report / extract chat surfaces.

## Affected

`app/src/components/chat-widgets/ChatColumn/` (the flow), a new `conversation/` engine + experience
module + `chatExperienceRegistry` catalog, `views/Onboarding` wiring. Tests: `ChatColumn.test` is
RETARGETED in Phase 2 (testids → `chat-live-*`, the `mode`/`surface` prop removed) while preserving
equivalent user-level coverage — chip-dispatch + auto-advance + onboarding chrome + steady + gate (see
`tasks.md`, which is authoritative). Net **deletion** of ~one duplicated ~400-line flow component.
