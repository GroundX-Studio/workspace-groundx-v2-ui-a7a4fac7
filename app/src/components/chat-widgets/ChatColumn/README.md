# ChatColumn

The production chat-column widget. The same widget powers F2-F5
onboarding and `/c/:sessionId` steady mode.

2026-05-30-unified-conversation-flow Phase 2: ChatColumn no longer forks
a steady vs onboarding flow. There is **one** chat view —
`<ConversationFlow>` over the durable `useConversation` engine — and
onboarding is an **optional `ChatExperience`** injected by composition.
ChatColumn's only job is dispatch + experience selection. There is **no
`surface`/`mode` prop** and no steady/onboarding branching.

Per the no-duplicates rule (`memory/feedback_no_onboarding_duplicates.md`),
chat is literally one production flow; onboarding is an injected
experience, same engine/code path.

## What it does

Reads the active chat session + onboarding session/scenario state and
dispatches to one of:

- **Viewer overlay active** (`bookingActive` / `signInActive`) →
  `<ConversationFlow>` stays mounted. The overlay belongs to the
  viewer stack, not a replacement chat mode.
- **Steady chat** (active session is non-onboarding) → `<ConversationFlow>`
  with **no experience** (the bare chat: live-turns + input bar).
- **Onboarding journey** (F2–F5 with a scenario) → `<ConversationFlow>`
  with the onboarding `ChatExperience` looked up from
  `chatExperienceRegistry.byId("onboarding").create({ scenarioId, thinkingScript })`
  (scripted ThinkingStream + Done bubble + Pick-a-view pills above the
  thread; the f3/f5 auto-advances live in the experience's `Choreography`
  + the ThinkingStream `onDone`).
- **F1** → idle placeholder ("Ask anything about the sample…").
- **F2 BYO without scenario** → `ByoChatPlaceholder` ("sign in to upload").

The live-turn rendering, persisted-thread hydration (RT-01), send path
(CF-18), and orchestrator integration for chip-driven LLM intents all
live in `useConversation` / `ConversationFlow` / `chatPrimitives` (under
`conversation/`), shared by every mount.

## Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `role` | `WidgetRole` (`"anonymous" \| "member"`) | — (required) | Widget AUTHORIZATION role. ChatColumn is all-roles and locks no affordance by role today; the prop satisfies the widget contract and is forwarded to children (via `ConversationFlow`) as roles get teeth. NEVER selects the flow. |
| `scope` | `WidgetScope` | — (required) | Always `{ type: "none" }` — chat is session-scoped, not document-scoped. ChatColumn is not a ScopedViewerWidget. |
| `overrideScenarioId` | `string \| null` | undefined | Onboarding only — used by the F2→F1 slide-out so the leaving pane shows the conversation that's sliding away. |
| `overrideFrame` | `FFrame` | undefined | Onboarding only — same use case as `overrideScenarioId`. |
| `bookingActive` | `boolean` | `false` | Keeps the same chat mounted while Calendly is shown in the viewer. |
| `signInActive` | `boolean` | `false` | Keeps the same chat mounted while sign-in is shown in the viewer. |

The steady-vs-onboarding signal is the **active chat session's
`isOnboardingSession` flag** (read from the source of truth, the same flag
`useConversation` reads), NOT a flow mode prop.

## Scope

`scope` is **required** and is always `{ type: "none" }`. The chat
column is session-scoped, not document-scoped — it is not one of the
four `ScopedViewerWidget`s (PdfViewer / Extract / SmartReport /
Integrate) that take a real `ContentScope`. See
`docs/agents/widget-access-matrix.md` §1b.

## Locked affordances (read-only roles)

**None today.** ChatColumn is available to both `anonymous` and
`member` and locks no editable control by role (matrix §1 + §2). When a
future read-only role (e.g. `viewer`) lands, gate the relevant control
on `widgetRoleCanEdit(role)` and add a matrix row.

The onboarding-only chrome (scripted `ThinkingStream` reveal,
sample-switcher subline + scenario header, Pick-a-view pills) is a
function of the **injected onboarding experience**, **not** of `role`.
The steady chat (non-onboarding session) drops them while the
conversation engine, hydration, send path, and orchestrator dispatch
stay shared.

## Events

All conversation events are owned by `useConversation` / `ConversationFlow`:

- POSTs `/api/chat/messages` via `sendChatMessage` on user submit.
- Calls `enqueueFieldProposal` (ChatStore) when the reply carries a
  `proposedSchemaField`.
- Dispatches each `reply.intents[]` entry via the canvas orchestrator.
- Dispatches `suggested-intent` / `tool:<name>` chip clicks via the
  orchestrator.

The onboarding experience's `Choreography` auto-advances the onboarding
frame to F5 when the user types a real turn while sitting in
F2/F3/F3a/F4, and the experience's `Intro` ThinkingStream advances F2→F3
on completion.

## How to mount

```tsx
import { ChatColumn } from "@/components/chat-widgets/ChatColumn/ChatColumn";

// Onboarding shell (role sourced from auth state):
<ChatColumn
  role={signedIn ? "member" : "anonymous"}
  scope={{ type: "none" }}
  bookingActive={bookCallActive}
  signInActive={signupSurfaceActive}
/>

// Steady shell (same component; the non-onboarding session selects the bare chat):
<ChatColumn role={widgetRole} scope={{ type: "none" }} />
```

`OnboardingShell` and `SteadyShell` are the only production callers.
`role` is sourced from the auth/session state via `useWidgetRole()`.
Neither shell passes a flow mode.

## LLM tools

See [`no-llm.md`](./no-llm.md). The chat column is the chat surface
itself — tools live on the widgets it composes
(`SuggestedActionChips`, `ProposeSchemaFieldCard`, etc.).

## Why the file lives here

This component lives at `components/chat-widgets/ChatColumn/` so the
widget-contract drift guard (`src/test/widget-contract.test.ts`)
auto-discovers it and asserts:
1. This README exists (with the required section headers).
2. A sibling `ChatColumn.test.tsx` exists.
3. The main `.tsx` declares BOTH a `role` and a `scope` prop, and no
   retired `mode: "onboarding" | "steady"` literal / raw id prop.

If any of those regress, CI fails. The conversation engine + view +
experience layer live OUTSIDE the widget slots, under `conversation/`,
so the widget-contract drift guard does not apply to them.

## Related

- `conversation/useConversation` — the durable conversation engine.
- `conversation/ConversationFlow` — the single chat view.
- `conversation/ChatExperience` + `conversation/chatExperienceRegistry`
  — the optional pluggable experience abstraction + its data catalog.
- `conversation/experiences/onboarding/experience` — the onboarding
  reference experience (`makeOnboardingExperience`).
- `chat-widgets/ThinkingStream/` — the scripted-notes widget the
  onboarding experience's `Intro` embeds.
- `viewer-widgets/SignUpWidget/` — the viewer-side sign-in overlay.
- `viewer-widgets/PdfViewer/` — the canvas-side companion (same shell,
  different slot).
