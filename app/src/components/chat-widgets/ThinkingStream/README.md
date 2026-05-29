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

| Prop          | Type                          | Default        | Notes                                                                |
| ------------- | ----------------------------- | -------------- | -------------------------------------------------------------------- |
| `notes`       | `string[]`                    | required       | The notes to stream, in reveal order. One italic bubble per entry.   |
| `scenarioKey` | `string`                      | required       | Stable id for sessionStorage namespacing (scenario id / upload id).  |
| `mode`        | `"onboarding"` \| `"steady"`  | `"onboarding"` | Onboarding persists doneness; steady doesn't (each upload is unique).|
| `onDone`      | `() => void`                  | optional       | Fires once when the stream finishes (after the post-stream delay).   |

## Behavior

- **Reveal cadence:** randomized per-note pause within 1500–2800ms.
  Keeps the stream from reading as a deterministic script.
- **Post-stream delay:** 1200ms after the last note before `onDone`
  fires. Gives the user a beat to read the final line before any
  follow-up CTA the consumer reveals.
- **Replay guard (onboarding only):** once the stream plays to done
  in this tab, the persisted `sessionStorage` flag means a remount
  (compact-mode toggle, viewport resize) skips the reveal — all
  notes appear immediately and `onDone` fires next tick.
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

## Mode semantics

| Mode          | Persist done? | Cadence            | Notes                                              |
| ------------- | ------------- | ------------------ | -------------------------------------------------- |
| `onboarding`  | yes           | 1500-2800ms        | Scripted notes from scenario manifest              |
| `steady`      | no            | 1500-2800ms (TBD)  | Future: real upload progress events as they arrive |

Steady mode's cadence will likely move from timer-driven to event-
driven once the real upload-progress stream lands. Until then the
widget treats both modes identically except for the persistence flag.

## Locked affordances under `mode="onboarding"`

- Replay guard via sessionStorage — onboarding's scripted notes only
  play once per scenario per tab. Steady mode persists nothing
  (each upload is unique).

## Events

- `onDone()` — fires once after the post-stream delay. Subscribe and
  reveal whatever Done / CTA combo the host needs.

## How to mount

```tsx
import { ThinkingStream } from "@/components/chat-widgets/ThinkingStream/ThinkingStream";

<ThinkingStream
  notes={scenario.thinkingScript}
  scenarioKey={scenario.id}
  mode="onboarding"
  onDone={() => setShowDone(true)}
/>
```

`ChatColumn`'s `F2ConversationFlow` is the only production caller
today; steady mode will mount it once a real upload-progress feed
exists.

## LLM tools

See [`no-llm.md`](./no-llm.md). The widget is a pure timer-driven
display; the host owns the note source and the post-stream behavior.
