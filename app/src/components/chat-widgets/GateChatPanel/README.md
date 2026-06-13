# GateChatPanel

Legacy chat-column body for the old gate moment (F2 onward, and any
save/export/threshold gate). The live sign-in path no longer mounts this
component; `ChatColumn` keeps `ConversationFlow` mounted while
`SignUpWidget` renders in the viewer overlay.

2026-05-31-dependency-direction-guard Phase 1 moved this here from
`views/Onboarding/GateChatPanel.tsx`. It mounts a chat-widget
(`GateChatRail`), so it belongs in the chat-widget slot. Its old home in `views/` forced a
widget → view → widget dependency inversion (`ChatColumn` imported a view,
the view imported `GateChatRail` back out of `chat-widgets/`). The move is
preserved the historical component for tests/reference; current live routing
does not import it.

## What it does

- **Gate idle** (`gate.status` not `open`/`committed`) → renders the idle
  chat placeholder ("Ask anything about the sample…").
- **Gate just opened, not yet composed** → renders the typing indicator
  for a composing beat (`~1500ms` for the `byo` trigger, `~600ms` for
  `save`/`export`/`threshold`). The "has composed once" flag persists in
  `localStorage` keyed by the ChatStore `ownerKey`, so the typing beat does
  not replay on re-open within the same anon session.
- **Gate open + composed, or committed** → fades in `GateChatRail` (the
  chat-side half: preamble, book-a-call CTA, dismiss, committed success
  card). The form half lives in `viewer-widgets/SignUpWidget`, mounted
  separately by `OnboardingShell` in the canvas slot.

Respects `prefers-reduced-motion`: skips both the composing delay and the
mount translate.

## Props

| Prop    | Type          | Required | Notes |
| ------- | ------------- | -------- | ----- |
| `role`  | `WidgetRole`  | yes      | The gate is the pre-sign-up moment, so the meaningful value is `anonymous`. Forwarded to `GateChatRail`. |
| `scope` | `WidgetScope` | yes      | Session-scoped, not document-scoped → always `{ type: "none" }`. Forwarded to `GateChatRail`. |

## Scope

Always `{ type: "none" }`. GateChatPanel is session-scoped — it reflects
the onboarding session's gate state and is not a ScopedViewerWidget. It
does not read or filter document/bucket/project content.

## Locked affordances

None of its own. GateChatPanel is a legacy dispatcher +
composing-animation wrapper; the historical affordances lived on the
`GateChatRail` it composed and on the `SignUpWidget` form.

## Events

No callback props. The panel reads gate transitions from
`useOnboardingSession()` (`openGate`/`commitGate`/`dismissGate` are driven
elsewhere — the StepStrip, IngestView, the SignUpWidget) and re-renders to
match. It owns one local side effect: persisting the "composed once" flag
to `localStorage`.

## How to mount

Legacy-only example:

```tsx
import { GateChatPanel } from "@/components/chat-widgets/GateChatPanel/GateChatPanel";

<GateChatPanel role="anonymous" scope={{ type: "none" }} />
```

The live `ChatColumn` must not mount this component for sign-in; it renders
`ConversationFlow` and receives explicit overlay booleans from
`OnboardingShell`.

## LLM tools

None — see `no-llm.md`. GateChatPanel is a legacy status-driven dispatcher
with no first-class LLM-drivable action.
