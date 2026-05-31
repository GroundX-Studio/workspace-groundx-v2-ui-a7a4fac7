# Design — Unified conversation flow + pluggable chat experiences

## Current state (evidence)

`ChatColumn` (`components/chat-widgets/ChatColumn/ChatColumn.tsx`):
- `ChatColumn` (134) dispatches: `mode==="steady"` → `<SteadyConversationFlow/>` (260, ~390 ln);
  else `<ChatColumnInner/>` (144) → for the F2–F5 journey → `<F2ConversationFlow/>` (648, ~550 ln).
- **`SteadyConversationFlow`** and **`F2ConversationFlow`** each independently implement: `useState<LiveTurn[]>`,
  the `activeChatSession.messages`→`liveTurns` projection effect, `handleSend` (`sendChatMessage` +
  optimistic user/assistant turns + citation/action projection), `handleSuggestedAction`, and the render.
- Diff of the two `handleSend`: identical except `isOnboarding: false` vs `isOnboarding:
  session.isOnboardingSession ?? true`, plus F2's `advanceFrame("f5")` on first send.
- F2-only extras (decoration/choreography): scripted intro `ThinkingStream` (`advanceFrame("f3")` on
  done), pick-view pills (`derivePickViews`), and the mount-persistence routing hack (comment at :172).

The render half was already deduped into `<LiveTurnList>` (core-data-model-hardening). This change
dedups the **engine** and replaces the fork with one flow + a pluggable experience layer.

## Target architecture

### 1. The durable engine — `useConversation(chatSessionId)`
Owns ALL chat behavior, knows NOTHING about onboarding/frames/scripts:
```ts
interface ConversationApi {
  liveTurns: LiveTurn[];
  sending: boolean;
  send: (text: string) => Promise<void>;          // sendChatMessage + optimistic turns; isOnboarding from session
  handleSuggestedAction: (a: ChatSuggestedAction, citations?: Citation[]) => void;
  seedTurns: (turns: LiveTurn[]) => void;          // inject one-shot experience seed
  // lifecycle the experience layer observes (no frame/script coupling here):
  events: { onFirstUserSend?: () => void };        // (impl: a small emitter / callback ref)
}
function useConversation(chatSessionId: string | null, opts?: { onFirstUserSend?: () => void }): ConversationApi
```
`isOnboarding` is read from `activeChatSession.isOnboardingSession` (not hardcoded), so the same `send`
serves both. Lifecycle is exposed as callbacks/an emitter — the engine never calls `advanceFrame`.

### 2. The single view — `<ConversationFlow>` (NO mode)
```tsx
function ConversationFlow({ chatSessionId, experience }: {
  chatSessionId: string | null;
  experience?: ChatExperience;   // OPTIONAL — absent → the bare chat. There is NO mode prop.
}) {
  const conv = useConversation(chatSessionId, { onFirstUserSend: () => experience?.onFirstUserSend?.() });
  // seed once on mount if the experience provides seedTurns
  return (
    <Column>
      {experience?.Intro && <experience.Intro conversation={conv} />}
      <LiveTurnList
        liveTurns={conv.liveTurns}
        sending={conv.sending}
        onSuggestedAction={conv.handleSuggestedAction}
      />
      <LiveChatInputBar onSend={conv.send} disabled={conv.sending} />
      {experience?.Choreography && <experience.Choreography conversation={conv} />}
    </Column>
  );
}
```
There is **no `mode`** ("steady"/"onboarding") and **no `ChatEntryContext`**. The presence/shape of the
optional `experience` is the only thing that varies behavior. With no experience you get the bare chat;
that IS what used to be called "steady". `LiveTurnList` loses its `mode` prop too — one flow ⇒ one set
of testids (`chat-live-user` / `chat-live-assistant` / `chat-thinking`, no `steady-`/`onboarding-`
prefix).

> **Why `Intro`/`Choreography` are components, not hooks.** An experience may be present or not at
> runtime; you cannot conditionally *call* a hook (Rules of Hooks), but you *can* conditionally *render*
> a component. `Choreography` returns `null` and uses whatever hooks it needs internally
> (`useOnboardingSession`, navigation). This is the crux that makes the layer optional AND legal.

### 3. The pluggable experience — `ChatExperience` (all fields optional)
```ts
interface ChatExperience {
  Intro?: FC<{ conversation: ConversationApi }>;      // scripted intro / pills / quick-actions, above the thread
  seedTurns?: () => LiveTurn[];                       // one-shot messages injected on mount
  Choreography?: FC<{ conversation: ConversationApi }>; // render-null director (side-effects)
  onFirstUserSend?: () => void;                       // convenience lifecycle hook (or do it inside Choreography)
}
// NOTE: identity lives on the CATALOG ENTRY (`ChatExperienceEntry.id`), not on the experience itself —
// there is no second `ChatExperience.id`. If telemetry needs the id, the mount site passes the entry id
// alongside (it already has it from the `byId` lookup). One id, one owner.
```
**Everything is optional.** Each experience is a **factory closing over its own config** — it does not
receive a generic context. e.g. `makeOnboardingExperience({ scenarioId, thinkingScript })`,
`makeWorkspaceExperience({ scope })`. The `Intro`/`Choreography` components receive only
`{ conversation }`; their config is closed over at construction. Need to scope the chat to a workspace
or project? That's just the experience's own config (a `ContentScope`), not a flow concept.

### 3a. The experience **catalog** (a data catalog — NOT a resolver)
Experiences are organized in a small **data catalog** (`chatExperienceRegistry`), consistent in API +
style with the existing catalogs (`ScenarioRegistry` = remote content catalog; `toolRegistry` = local
glob catalog). It is a `Catalog<ChatExperienceEntry>` — you **enumerate and look up**, you do not
dispatch:
```ts
interface ChatExperienceEntry {
  id: string;                          // "onboarding" | "workspace" | "project"
  label?: string;                      // human label — for enumeration (debug menu / nav offering)
  configSchema: z.ZodTypeAny;          // validates create()'s arg — mirrors WidgetTool.input
  create: (config: unknown) => ChatExperience;  // the factory; config parsed by configSchema
}
// chatExperienceRegistry: Catalog<ChatExperienceEntry>
//   all(): readonly ChatExperienceEntry[];   byId(id): ChatExperienceEntry | undefined;
//   glob of app/src/conversation/experiences/<id>/experience.ts — OUTSIDE components/{chat,viewer}-widgets/
//   so the widget-contract drift guard never applies to it; unique-id via assertUniqueIds (throws on dup),
//   same assembly style as toolRegistry.
```
**Catalog, not dispatcher — the distinction that keeps this safe.** The catalog *lists* and *finds*
experiences; the **caller still composes**: it picks the `id`, supplies the config, and passes the
result to `ConversationFlow`. The catalog NEVER takes an entry-context and auto-resolves+mounts an
experience. That `resolveExperience(entryContext)` shape is exactly the rejected dispatcher (see "vs
alternatives"). `byId` + caller-supplied config = lookup; `resolve(context)` = dispatch. We do the former.

### 4. Onboarding as the reference experience
`makeOnboardingExperience({ scenarioId, thinkingScript })` → a `ChatExperience` where:
- `Intro` — the scripted `ThinkingStream` (closes over `thinkingScript`) + the pick-view pills
  (`derivePickViews`). Exactly today's F2 header content, lifted out.
- `Choreography` — a render-null `FC` using `useOnboardingSession`: `advanceFrame("f3")` when the
  ThinkingStream completes, `advanceFrame("f5")` on first send. Exactly today's two `advanceFrame`
  calls, moved out of the engine.

### 5. `ChatColumn` after
```tsx
const ChatColumn = ({ overrideScenarioId, overrideFrame }) => {            // NO `mode` param
  if (gateActive) return <GateChatPanel/>;                                  // gate overlay (unchanged)
  if (isF1 || noScenario) return <Idle/Byo placeholder/>;                   // onboarding placeholders stay
  // In the onboarding journey, look the experience up in the catalog + construct it; elsewhere, none.
  const experience = inOnboardingJourney
    ? chatExperienceRegistry.byId("onboarding")?.create({ scenarioId, thinkingScript })
    : undefined;
  return <ConversationFlow chatSessionId={activeId} experience={experience} />;
};
```
There is no steady/onboarding branch and no entry context — just "construct an experience (or not) and
pass it." A plain authenticated chat surface mounts `<ConversationFlow chatSessionId={id} />` with no
experience. Future Workspace/Project surfaces mount `<ConversationFlow experience={makeWorkspaceExperience({scope})} />`;
**zero new flow components, zero modes.**

> **Out-of-scope tension flagged: the per-widget `mode` contract.** The locked widget contract says
> every widget accepts a `mode: "onboarding" | "steady"` prop that *locks certain controls*. That is a
> DIFFERENT axis from the flow mode removed here — it's really "is this surface gated/uncommitted?",
> driven by auth/gate state, not by a forked flow. This change removes the FLOW mode only. The child
> widgets that take `mode` (`SuggestedActionChips`, `ProposeSchemaFieldCard`) get it from auth/gate
> state (not a flow mode); whether the widget `mode` contract should itself be re-expressed via the
> experience model is a separate, codebase-wide question for the widget-contract owners — NOT changed here.

## Why this shape (vs alternatives)
- **vs the current fork**: one engine, no duplication; the durable bare chat is the base, not a copy.
- **vs a `mode`-branched monolith**: there is NO mode. The engine stays clean; onboarding/workspace
  logic lives in *their* experience modules, not in `if (mode)` branches threaded through the engine.
- **vs a registry-as-resolver + entry-context**: dropped. The rejected shape was a *resolver* —
  `resolveExperience(entryContext) → experience` — where a `ChatEntryContext` bag drives which whole
  experience mounts. We keep a registry only as a **data catalog** (§3a: `byId`/`all`, lookup +
  enumerate); the caller still composes (picks the id, supplies config, passes the result). Catalog =
  lookup; resolver = dispatch. No `ChatEntryContext`, no auto-resolution. An experience closes over its
  own typed config; that's all the "context" it needs.

## Kills the mount-persistence hack
`ChatColumnInner:172`'s "keep mounted across F2→F5 so auto-advance doesn't wipe `liveTurns`" exists
because the forked flow could unmount on frame change. With one always-mounted `ConversationFlow` and
onboarding as decoration *around* it, the conversation never unmounts → persistence is structural. The
hack + comment are removed; a test asserts `liveTurns` survive an onboarding frame advance.

## Phased, behavior-preserving delivery (TDD)
1. **Extract `useConversation`** — pull the engine into the hook; point BOTH existing flow components at
   it (pure dedup, no structural change). Both suites green. *(Safe even if we stop here.)*
2. **Introduce the optional `ConversationFlow` + `ChatExperience` (all fields optional) + `makeOnboardingExperience(config)`**;
   route `ChatColumn` to construct-and-pass the onboarding experience (or none); **delete
   `SteadyConversationFlow`/`F2ConversationFlow` and all steady/onboarding `mode` + `ChatEntryContext`**.
   `ChatColumn.test` is **RETARGETED, not preserved** — its testids drop the `onboarding-`/`steady-`
   prefixes (`onboarding-chat-live-*`/`steady-chat-live-*` → `chat-live-*`, etc.) and the `mode="steady"`
   render-prop is removed (~50 `expect(...)` testid assertions updated across ~9 `mode="steady"` mount
   sites). Chip-dispatch and the f3/f5 auto-advance (now driven by the onboarding experience's
   `Choreography`) are re-asserted against the single-flow testids.
3. **Remove the mount-persistence hack** + comment; add a test that `liveTurns` persist across an
   onboarding frame advance.
4. (Follow-on, separate) wire entry points → experiences: author the nav-rail Workspace/Project/document
   entry experiences (composed by the authenticated shell's `OnboardingNav` entries, today disabled
   stubs), and make the canvas one shared experience/scope-driven surface hosted by both shells.

## Risks / watch-items
- **Auto-advance timing**: the f3/f5 transitions move from inline to a Choreography component observing
  engine events — the events (`onFirstUserSend`, intro-done) must fire at the same moments. Pin with the
  existing auto-advance tests.
- **Rules of Hooks**: `Intro`/`Choreography` MUST be rendered, never called as hooks (enforced by the
  component typing).
- **Gate + placeholders**: stay as-is. The signup gate is a **widget** (`SignUpWidget` / `GateChatRail`
  / `GateValueProp`, anonymous-only per the widget access matrix), NOT a chat experience — it is a thing
  the onboarding surface shows, orthogonal to which experience is loaded. F1/BYO placeholders are
  pre-conversation.

## Architectural framing — shells, the one main view, and entry points

This change is the *chat-engine* half of a larger target. Recording the frame so follow-ons converge:

- **Shells stay separate, by design.** A shell = a per-context wrapper (chrome + entry points): the
  onboarding shell (full-screen overlay entry), the authenticated shell (nav side rail), and possibly
  future contexts. Different contexts legitimately get different shells. We do NOT collapse them.
- **The main VIEW is shared, not the shell.** What every shell hosts is ONE main view = the chat
  (`ConversationFlow`, this change) + an experience/scope-driven canvas (the `ScopedViewerWidget` set —
  core-data-model-hardening + the `real-data-rewire-gap` fold of `UnderstandView`/`ExtractView`/… into
  thin wrappers). The anti-pattern to kill is a shell re-implementing the view (today `OnboardingShell`
  has a bespoke per-frame canvas switch while `SteadyShell` mounts `AppShell` + `PdfViewerWidget`).
- **The entry point IS the mount site that composes the experience** (this change's "selection by
  composition"). Onboarding's overlay composes `makeOnboardingExperience(...)`; the authenticated nav
  rail's Workspaces/Projects entries (today disabled stubs in `OnboardingNav`) will compose
  `makeWorkspaceExperience({scope})` / `makeProjectExperience({scope})` / a document(+filter) experience.
  No `ChatEntryContext` resolver — the entry UI constructs and passes the experience (see "vs alternatives").
- **Out of this change** (tracked): making the canvas one shared experience/scope-driven surface hosted
  by both shells (core-data ScopedViewerWidget + real-data-rewire); authoring the nav-rail
  Workspace/Project/document entry experiences.
