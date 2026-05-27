# ChatColumn

The production chat-column widget. The same widget powers F2-F5
onboarding and `/c/:sessionId` steady mode — onboarding is just
steady with scripted decorations turned on.

Per the no-duplicates rule (`memory/feedback_no_onboarding_duplicates.md`),
this is **the** chat surface. `OnboardingShell` and `SteadyShell` both
mount it; they differ only in the `mode` prop and the host shell's
header/nav slots.

## Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `mode` | `"onboarding" \| "steady"` | `"onboarding"` | Selects which sub-flow renders. |
| `overrideScenarioId` | `string \| null` | undefined | Onboarding only — used by the F2→F1 slide-out so the leaving pane shows the conversation that's sliding away. |
| `overrideFrame` | `FFrame` | undefined | Onboarding only — same use case as `overrideScenarioId`. |

## What each mode renders

**`mode="onboarding"`** (default; mounted by `OnboardingShell`)
- Gate-active branch hands off to `GateChatPanel`.
- F1 → idle placeholder ("Ask anything about the sample…").
- F2 with scenario → scripted thinking-stream + Done bubble +
  Pick-a-view pills, then live-turns + LiveChatInputBar.
- F3-F7 → idle placeholder.
- F2 BYO without scenario → ByoChatPlaceholder ("sign in to upload").
- Sample-switcher subline (so the user can pivot Utility ↔ Loan ↔ Solar
  without leaving the chat surface).

**`mode="steady"`** (mounted by `SteadyShell` — UI-05)
- Bare conversation: empty-state placeholder until the user types,
  then live-turns + LiveChatInputBar.
- No scripted decorations: no ThinkingStream, no Pick-a-view pills,
  no sample-switcher, no scenario header.
- Hydrates from `/api/chat-sessions/:id/messages` on mount (RT-01);
  sends to `/api/chat/messages` (CF-18); persists per RT-01..05.

## Shared infrastructure (used by both modes)

- `liveTurns` state — optimistic user+assistant turns rendered as
  `<UserBubble>` / `<BotBubble>`.
- RT-01 hydration effect — reads persisted thread on mount via
  `listChatMessages(chatSessionId)`.
- `handleSend(text)` — POSTs to `/api/chat/messages` via
  `sendChatMessage`, renders the reply or maps the error via
  `chatErrorToUserCopy`.
- `<LoadingDots>` "thinking" bubble while `sending`.
- `<LiveChatInputBar>` text input at the bottom (disabled while sending).

## Why the file lives here

This component lives at `components/chat-widgets/ChatColumn/` so the
widget-contract drift guard (`src/test/widget-contract.test.ts`)
auto-discovers it and asserts:
1. This README exists.
2. A sibling `ChatColumn.test.tsx` exists.
3. The `mode` prop is declared in the props type.

If any of those three regress, CI fails.

## Outer-dispatch + inner-component pattern

The exported `ChatColumn` is a thin dispatcher:

```tsx
export const ChatColumn: FC<ChatColumnProps> = ({ overrideScenarioId, overrideFrame, mode = "onboarding" }) => {
  if (mode === "steady") return <SteadyConversationFlow />;
  return <ChatColumnInner overrideScenarioId={overrideScenarioId} overrideFrame={overrideFrame} />;
};
```

Each mode's inner component owns a stable hook order — the dispatch
doesn't violate the Rules of Hooks even if `mode` were to change
mid-life (which it doesn't in practice; OnboardingShell vs SteadyShell
mount different parents).

## Related

- `chat-widgets/ThinkingStream/` — the scripted-notes widget the
  onboarding mode embeds.
- `chat-widgets/GateChatRail/` — the gate-state widget that takes
  over when `gate.status === "open" | "committed"`.
- `chat-widgets/BookingStatusCard/` — replaces the chat column when
  the user is mid-Calendly-booking.
- `viewer-widgets/PdfViewer/` — the canvas-side companion (same shell,
  different slot).
