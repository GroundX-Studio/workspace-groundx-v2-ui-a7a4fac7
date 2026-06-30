# SuggestedActionChips

**Slot:** `chat-widgets` · **Status:** shipped
(widget-llm-integration Phase 1, 2026-05-27)

A horizontal row of clickable chips rendered beneath an assistant
bubble. Sources its data from `reply.suggestedActions[]` — the array
the chat router emits on every reply, which the frontend silently
dropped pre-Phase-1.

## What it does

Renders one chip per `SuggestedAction`. Each chip is keyboard-activatable
(Enter or Space) and exposes a stable `data-testid` of
`suggested-action-chip-<key>` for tests and the future LLM tool
registry. Click invokes the host's `onAction(action)` callback with
the full action object (including `detail`).

Today the host (`ChatColumn`) maps known action keys to orchestrator
behavior:

- `suggested-intent` with `detail.intent === "show-extract"` →
  `switchFrame` to `f3` (the extract surface).
- Other keys are accepted but currently no-op while broader mapping
  lands in Phase 3+ (declarative tool registry).

## Props

```ts
interface SuggestedActionChipsProps {
  actions: SuggestedAction[];
  /** Authorization role (widget contract). REQUIRED. */
  role: WidgetRole; // "anonymous" | "member"
  /** Content scope (widget contract). REQUIRED. Always `{ type: "none" }` here. */
  scope: WidgetScope;
  /** Click handler. Host translates the action into orchestrator behavior. */
  onAction?: (action: SuggestedAction) => void;
}

interface SuggestedAction {
  key: string;
  label: string;
  detail?: Record<string, unknown>;
}
```

## Locked affordances (read-only roles)

**None.** Per the widget access matrix this widget is available to ALL
roles (`anonymous` + `member`) and locks NO affordance by role — the
chips render identically for both. `role` exists to satisfy the widget
contract and to reserve space for future role-conditional locks (e.g.
dimming destructive actions for a read-only role) without an API change.
It replaces the retired `mode: "onboarding" | "steady"` prop, which was
purely cosmetic here and is dropped.

## Scope

`{ type: "none" }`. This is a display/actions widget, not a
ScopedViewerWidget (PdfViewer / Extract / SmartReport / Integrate), so
it does not target a `ContentScope`. The `scope` prop is required by the
widget contract and defaults to `{ type: "none" }`.

## Events

- `onAction(action)` — fired on click or keyboard activation. The host
  decides what the action means.

## How to mount

```tsx
<SuggestedActionChips
  actions={turn.suggestedActions ?? []}
  role={role} // from useWidgetRole(): "anonymous" | "member"
  scope={{ type: "none" }}
  onAction={handleSuggestedAction}
/>
```

Mount beneath each assistant `BotBubble` that carries
`suggestedActions`. Empty arrays render nothing, so callers can
unconditionally render the widget without a guard.

## LLM tools

See [`no-llm.md`](./no-llm.md). The widget is the RENDERER for
`reply.suggestedActions[]` — the LLM drives it indirectly by emitting
the actions on each chat reply. Chip clicks are user-driven nav back
into the orchestrator; no first-class action belongs on this widget.

## Tests

`SuggestedActionChips.test.tsx`. Covers:

- One chip per action with stable testid
- Mounts under `role="anonymous"` and `role="member"`, reflecting it on
  `data-role` (widget access matrix row: all roles)
- Chips render identically for both roles (matrix: no affordance lock)
- Click fires `onAction` with the full action object
- Empty array renders nothing
- Keyboard Enter activates a chip
