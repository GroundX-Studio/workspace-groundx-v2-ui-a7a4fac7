# PinToReportAction

**Slot:** `chat-widgets` · **Status:** Phase 5 (2026-05-29-smart-report-screen)

## What it does

Renders the `📌 pin to report` affordance. Clicking it pins the turn's **literal
text** (#12 — no auto-variable inference) as a report section via the ChatStore
`pinToReport` action — the **existing-or-new** template UX (NO silent
auto-create). The action returns a `PinResolution` (`prompt-new-only` /
`single-existing` / `prompt-existing-or-new`) which the affordance surfaces as a
confirmation.

**report-pin-affordance:** it is OPT-IN and COMPACT, not carried on every turn.
It renders only on genuine answer turns (`LiveTurn.pinnable === true`), hosted by
the internal `components/conversation/AnswerActions` control on the answer's
affordance row — NOT a full-width pill, and never on agent narration / scripted /
error turns. `variant="compact"` (the AnswerActions host) renders a single 📌
icon button with a TRANSIENT confirmation; `variant="pill"` (default) is the
legacy labelled pill.

## Props

```ts
interface PinToReportActionProps {
  /** REQUIRED authorization role (anonymous | member). Pin is available to all roles. */
  role: WidgetRole;
  /** REQUIRED scope — `{ type: "none" }`; operates on the draft template, not a doc set. */
  scope: WidgetScope;
  /** The assistant turn being pinned (recorded as `pinnedFromTurnId`). */
  turnId: string;
  /** The turn's literal text → the pinned section's `question`. */
  turnText: string;
  /** True while the turn is still streaming — dims + `aria-disabled`s the button and queues clicks. */
  streaming?: boolean;
  /** `"compact"` = a single 📌 icon button + transient confirmation (hosted in AnswerActions); `"pill"` (default) = the legacy labelled pill. */
  variant?: "pill" | "compact";
}
```

Both `role` and `scope` are REQUIRED by the widget contract.

## Scope

`scope` is always `{ type: "none" }` — the affordance operates on the draft
report template and the source turn, not a document set. (The pinned section's
render scope is supplied later at render time by `SmartReportRender`.)

## Locked affordances

- The pin button is **announced disabled mid-stream** (`streaming === true`) —
  dimmed + `aria-disabled`, but kept clickable (a native-`disabled` button would
  swallow the click and make queueing impossible). A click during streaming is
  **queued** and drains once streaming ends — no affordance is hidden by role.
  Pin itself is available to every role; whether the report is later *saved* is
  gated at the builder Save boundary, not here.

## Events

- **Click** → `ChatStore.pinToReport({ turnId, text })` lands a section into the
  active session's `reportOverlay.addedFields` and returns a `PinResolution`.
- **Queued click** (mid-stream) → drains via an effect when `streaming` flips
  to false.

## How to mount

```tsx
import { PinToReportAction } from "@/components/chat-widgets/PinToReportAction/PinToReportAction";

<PinToReportAction
  role={role}
  scope={{ type: "none" }}
  turnId={message.id}
  turnText={message.content}
  streaming={isStreaming}
/>
```

Mounted by `ChatColumn` beneath each assistant turn (the ChatColumn pin path
lands after the unified-conversation-flow rewrite stabilizes — step 17 note in
the cross-plan order). The interim production driver is the `pin_to_report` LLM
tool, which dispatches the same `pinToReport` `CanvasIntent`.

## LLM tools

`PinToReportAction.tools.ts` declares `pin_to_report({ turn_id, text,
template_id? })` — the chat twin of the button. The middleware
`SERVER_TOOL_CATALOG` intentBuilder emits the same `pinToReport` `CanvasIntent`
the button dispatches; the orchestrator routes both to `ChatStore.pinToReport`.
The app declaration is metadata only.

## Tests

`PinToReportAction.test.tsx` covers:

1. The affordance renders on an assistant turn (role + scope contract).
2. Clicking pins the turn's literal text as a section (`pinnedFromTurnId` set).
3. A mid-stream click QUEUES (nothing lands yet) and DRAINS when streaming ends
   (the section then lands with `pinnedFromTurnId` set).
4. Stream-end WITHOUT a mid-stream click is a no-op (the drain is click-gated).
