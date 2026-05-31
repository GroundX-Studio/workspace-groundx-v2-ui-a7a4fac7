# ChatColumn

The production chat-column widget. The same widget powers F2-F5
onboarding and `/c/:sessionId` steady mode — onboarding is just
steady with scripted decorations turned on.

Per the no-duplicates rule (`memory/feedback_no_onboarding_duplicates.md`),
this is **the** chat surface. `OnboardingShell` and `SteadyShell` both
mount it; they differ only in the `surface` prop and the host shell's
header/nav slots.

## What it does

Owns the chat surface end-to-end: header chrome, scripted onboarding
decorations (when `surface="onboarding"`), live-turn rendering, persisted
thread hydration, send path, and orchestrator integration for
chip-driven LLM intents (Phase 1+5 widget-llm-integration).

## Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `role` | `WidgetRole` (`"anonymous" \| "member"`) | — (required) | Widget AUTHORIZATION role. ChatColumn is all-roles and locks no affordance by role today; the prop satisfies the widget contract and is forwarded to children as roles get teeth. NEVER selects the surface. |
| `scope` | `WidgetScope` | — (required) | Always `{ type: "none" }` — chat is session-scoped, not document-scoped. ChatColumn is not a ScopedViewerWidget. |
| `surface` | `"onboarding" \| "steady"` | `"onboarding"` | Which conversation SURFACE renders. FLOW/SHELL state sourced from the mounting shell, NOT from `role`. (Was the old flow `mode`; re-sourced — not renamed to `role` — by `2026-05-30-widget-role-access`. `unified-conversation-flow` removes it once the surfaces fully merge.) |
| `overrideScenarioId` | `string \| null` | undefined | Onboarding only — used by the F2→F1 slide-out so the leaving pane shows the conversation that's sliding away. |
| `overrideFrame` | `FFrame` | undefined | Onboarding only — same use case as `overrideScenarioId`. |

## Scope

`scope` is **required** and is always `{ type: "none" }`. The chat
column is session-scoped, not document-scoped — it is not one of the
four `ScopedViewerWidget`s (PdfViewer / Extract / SmartReport /
Integrate) that take a real `ContentScope`. See
`docs/agents/widget-access-matrix.md` §1b.

## What each surface renders

**`surface="onboarding"`** (default; mounted by `OnboardingShell`)
- Gate-active branch hands off to `GateChatPanel`.
- F1 → idle placeholder ("Ask anything about the sample…").
- F2 with scenario → scripted thinking-stream + Done bubble +
  Pick-a-view pills, then live-turns + LiveChatInputBar.
- F3-F7 → idle placeholder.
- F2 BYO without scenario → ByoChatPlaceholder ("sign in to upload").
- Sample-switcher subline (so the user can pivot Utility ↔ Loan ↔ Solar
  without leaving the chat surface).

**`surface="steady"`** (mounted by `SteadyShell` — UI-05)
- Bare conversation: empty-state placeholder until the user types,
  then live-turns + LiveChatInputBar.
- No scripted decorations: no ThinkingStream, no Pick-a-view pills,
  no sample-switcher, no scenario header.
- Hydrates from `/api/chat-sessions/:id/messages` on mount (RT-01);
  sends to `/api/chat/messages` (CF-18); persists per RT-01..05.

## Shared infrastructure (used by both surfaces)

- `liveTurns` state — optimistic user+assistant turns rendered as
  `<UserBubble>` / `<BotBubble>`.
- RT-01 hydration effect — reads persisted thread on mount via
  `listChatMessages(chatSessionId)`.
- `handleSend(text)` — POSTs to `/api/chat/messages` via
  `sendChatMessage`, renders the reply or maps the error via
  `chatErrorToUserCopy`.
- `<LoadingDots>` "thinking" bubble while `sending`.
- `<LiveChatInputBar>` text input at the bottom (disabled while sending).

## Locked affordances (read-only roles)

**None today.** ChatColumn is available to both `anonymous` and
`member` and locks no editable control by role (matrix §1 + §2). When a
future read-only role (e.g. `viewer`) lands, gate the relevant control
on `widgetRoleCanEdit(role)` and add a matrix row.

The onboarding-only chrome (scripted `ThinkingStream` reveal,
sample-switcher subline + scenario header, Pick-a-view pills) is a
function of `surface="onboarding"`, **not** of `role`. Under
`surface="steady"` those are dropped while the conversation shell,
hydration, send path, and orchestrator dispatch stay shared.

## Events

- POSTs `/api/chat/messages` via `sendChatMessage` on user submit.
- Calls `enqueueFieldProposal` (ChatStore) when the reply carries a
  `proposedSchemaField`.
- Dispatches each `reply.intents[]` entry via the canvas orchestrator
  (Phase 5).
- Dispatches `suggested-intent` chip clicks via the orchestrator
  (Phase 1).
- Auto-advances the onboarding frame when the user types a real turn
  while sitting in F2/F3/F3a/F4.

## How to mount

```tsx
import { ChatColumn } from "@/components/chat-widgets/ChatColumn/ChatColumn";

// Onboarding shell (role sourced from auth state, surface defaults to "onboarding"):
<ChatColumn role={signedIn ? "member" : "anonymous"} scope={{ type: "none" }} />

// Steady shell (UI-05):
<ChatColumn surface="steady" role="member" scope={{ type: "none" }} />
```

`OnboardingShell` and `SteadyShell` are the only production callers.
`role` is sourced from the auth/session state (Phase 3 adds a
`useWidgetRole()` selector); `surface` is sourced from the mounting
shell. Neither is derived from the conversation flow.

## LLM tools

See [`no-llm.md`](./no-llm.md). The chat column is the chat surface
itself — tools live on the widgets it composes
(`SuggestedActionChips`, `ProposeSchemaFieldCard`, the future
`BookingStatusCard` book_call tool, etc.).

## Why the file lives here

This component lives at `components/chat-widgets/ChatColumn/` so the
widget-contract drift guard (`src/test/widget-contract.test.ts`)
auto-discovers it and asserts:
1. This README exists.
2. A sibling `ChatColumn.test.tsx` exists.
3. The main `.tsx` declares BOTH a `role` and a `scope` prop, and no
   retired `mode: "onboarding" | "steady"` literal / raw id prop.

If any of those regress, CI fails.

## Outer-dispatch + inner-component pattern

The exported `ChatColumn` is a thin dispatcher:

```tsx
export const ChatColumn: FC<ChatColumnProps> = ({ overrideScenarioId, overrideFrame, surface = "onboarding" }) => {
  if (surface === "steady") return <SteadyConversationFlow />;
  return <ChatColumnInner overrideScenarioId={overrideScenarioId} overrideFrame={overrideFrame} />;
};
```

Each surface's inner component owns a stable hook order — the dispatch
doesn't violate the Rules of Hooks even if `surface` were to change
mid-life (which it doesn't in practice; OnboardingShell vs SteadyShell
mount different parents). `role`/`scope` are contract props; they do
not select the surface.

## Related

- `chat-widgets/ThinkingStream/` — the scripted-notes widget the
  onboarding surface embeds.
- `chat-widgets/GateChatRail/` — the gate-state widget that takes
  over when `gate.status === "open" | "committed"`.
- `chat-widgets/BookingStatusCard/` — replaces the chat column when
  the user is mid-Calendly-booking.
- `viewer-widgets/PdfViewer/` — the canvas-side companion (same shell,
  different slot).
