# ThinkingStream

Chat-widget for the timed "model is thinking" note reveal. The
italic, left-bordered notes that stream in one-by-one while a
document is being parsed.

Extracted from `views/Onboarding/OnboardingChatColumn.tsx`'s
`F2ConversationFlow` in ARCH-11 (2026-05-26) so steady mode can show
the same beat when a real upload is parsing.

## What it does

Renders a randomly-paced reveal of `notes[]` as italic, left-bordered
bubbles. Owns: per-note delay (1500-2800ms), post-stream pause
(1200ms), per-`scenarioKey` sessionStorage replay guard (onboarding
only), and a single-fire `onDone` callback.

## Props

| Prop            | Type          | Default            | Notes                                                                          |
| --------------- | ------------- | ------------------ | ------------------------------------------------------------------------------ |
| `notes`         | `string[]`    | required           | The notes to stream, in reveal order. One italic bubble per entry.             |
| `scenarioKey`   | `string`      | required           | Stable id for sessionStorage namespacing (scenario id / upload id).            |
| `role`          | `WidgetRole`  | required           | Widget-contract role. All-roles; locks nothing here. Forward-looking.          |
| `scope`         | `WidgetScope` | required           | Always `{ type: "none" }` — display widget (see § Scope).                      |
| `persistReplay` | `boolean`     | `false`            | Persist doneness so a remount skips the reveal. Re-sourced from the old `mode`.|
| `onDone`        | `() => void`  | optional           | Fires once when the stream finishes (after the post-stream delay).             |

## Behavior

- **Reveal cadence:** randomized per-note pause within 1500–2800ms.
  Keeps the stream from reading as a deterministic script.
- **Post-stream delay:** 1200ms after the last note before `onDone`
  fires. Gives the user a beat to read the final line before any
  follow-up CTA the consumer reveals.
- **Replay guard (`persistReplay` only):** once the stream plays to
  done in this tab, the persisted `sessionStorage` flag means a remount
  (compact-mode toggle, viewport resize) skips the reveal — all
  notes appear immediately and `onDone` fires next tick. The onboarding
  experience sets `persistReplay` for its scripted, play-once notes.
- **Empty notes:** renders nothing; fires `onDone` immediately.

## What this widget does NOT own

- **The "Done. Ready to analyze." bubble** that follows the stream.
  Subscribe to `onDone` and render whatever Done / CTA combo the
  surface needs.
- **The thinking-note source.** Onboarding feeds it the scenario's
  scripted `thinkingScript` from the manifest; steady will eventually
  feed it parsed-progress events from the BFF. The widget is purely
  presentational + state-keeping.
- **The "GroundX is thinking…" header / typing indicator.** Different
  widget (`GateChatPanel`'s `TypingIndicator` for the gate; future
  steady-mode upload progress shell). ThinkingStream picks up after
  the typing indicator hands off.

## sessionStorage key shape

`groundx-onboarding.thinking-stream-done.${scenarioKey}` → `"1"` when
the stream has played to done. Cleared by `localStorage.clear()` or
explicit removal; survives across page navigations within the same
tab but NOT across tab close.

## Replay semantics

| `persistReplay` | Persist done? | Cadence           | Notes                                              |
| --------------- | ------------- | ----------------- | -------------------------------------------------- |
| `true`          | yes           | 1500-2800ms       | Onboarding's scripted notes — play once per tab    |
| `false` (def.)  | no            | 1500-2800ms (TBD) | Future: real upload progress events as they arrive |

The cadence will likely move from timer-driven to event-driven once the
real upload-progress stream lands. Until then the widget treats both
cases identically except for the persistence flag. `persistReplay` is a
replay concern owned by the host — it is NOT derived from `role`.

## Scope

`scope` is always `{ type: "none" }` (matrix §1b). ThinkingStream
renders a list of notes, not a document set — it is a pure display
widget and never targets a `ContentScope`.

## Locked affordances (read-only roles)

**None.** ThinkingStream is an all-roles widget (matrix §1: anonymous
✅ / member ✅) and locks no affordance by role. `role` is required by
the widget contract and is forward-looking; it does not change what the
widget renders. The replay guard (`persistReplay`) is a host-owned
replay concern, NOT a role lock.

## Events

- `onDone()` — fires once after the post-stream delay. Subscribe and
  reveal whatever Done / CTA combo the host needs.

## How to mount

```tsx
import { ThinkingStream } from "@/components/chat-widgets/ThinkingStream/ThinkingStream";

<ThinkingStream
  notes={scenario.thinkingScript}
  scenarioKey={scenario.id}
  role={role}
  scope={{ type: "none" }}
  persistReplay
  onDone={() => setShowDone(true)}
/>
```

The onboarding `ChatExperience` (its scripted `Intro`, mounted via the
single `<ConversationFlow>`) is the only production caller today; steady
mode will mount it once a real upload-progress feed exists.

## LLM tools

See [`no-llm.md`](./no-llm.md). The widget is a pure timer-driven
display; the host owns the note source and the post-stream behavior.
