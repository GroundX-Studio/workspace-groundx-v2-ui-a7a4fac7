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
  /** Locked-affordance gate (widget contract). Defaults to "onboarding". */
  mode?: "onboarding" | "steady";
  /** Click handler. Host translates the action into orchestrator behavior. */
  onAction?: (action: SuggestedAction) => void;
}

interface SuggestedAction {
  key: string;
  label: string;
  detail?: Record<string, unknown>;
}
```

## Locked affordances under `mode="onboarding"`

No mode-specific locks yet. The prop exists to satisfy the widget
contract and to absorb future onboarding-only behavior (e.g. dimming
destructive actions during a guided step) without an API change.
Steady mode is reserved for future steady-only chips (e.g. a settings
shortcut) that don't apply in onboarding.

## Events

- `onAction(action)` — fired on click or keyboard activation. The host
  decides what the action means.

## How to mount

```tsx
<SuggestedActionChips
  actions={turn.suggestedActions ?? []}
  mode={isOnboarding ? "onboarding" : "steady"}
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
- `data-mode` reflects the mode prop (widget-contract drift guard input)
- Click fires `onAction` with the full action object
- Empty array renders nothing
- Keyboard Enter activates a chip
