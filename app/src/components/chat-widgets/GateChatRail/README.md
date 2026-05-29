# GateChatRail

Chat-slot widget for the sign-up gate. The viewer-side companion is
`viewer-widgets/SignUpWidget/`.

## What it does

Renders the chat-side mirror of the sign-up gate: an eyebrow + per-
trigger preamble + a book-a-call CTA + a "keep exploring" dismiss
link while `gate.status === "open"`; a committed-state success card
(varying by `method`) once the user signs up or books. The viewer-
side `SignUpWidget` carries the form fields themselves.

## Why split from `GateView`?

See `viewer-widgets/SignUpWidget/README.md` § "Why split from
`GateView`?". Short version: the old monolith stuffed form fields,
gate preamble, dismiss links, and a book-a-call CTA into the chat
column and left the viewer rendering whatever sample doc the user
came from. Splitting lets the OnboardingShell wire the viewer to the
form INSTEAD of leaving the sample in place.

## Props

| Prop   | Type                          | Default        | Notes                                                                                  |
| ------ | ----------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `mode` | `"onboarding"` \| `"steady"`  | `"onboarding"` | Onboarding shows the Continue-to-Integrate CTA on committed; steady omits it.          |

## What this widget owns

- **The eyebrow** — `SIGN UP` while open; `WELCOME — YOU'RE SIGNED IN`
  / `THANKS - CALL REQUESTED` once committed.
- **The preamble** — chooses per `gate.trigger`:
  - `save` → "Save your work to come back to it. One quick step."
  - `export` → "Export uses your account so it's tied to you…"
  - `byo` → "Bring your own data. Sign in to start uploading."
  - `threshold` → "You've reached the free-tier ceiling…"
- **The book-a-call CTA** — sets `?bookCall=1` in the URL. The
  OnboardingShell sees the param and swaps the viewer to the Calendly
  embed (`BookCallView` widget); the sibling `BookingStatusCard`
  widget takes over the chat column.
- **The `← Keep exploring` dismiss link** — calls
  `dismissGate()` from `OnboardingSessionContext`. ESC also works
  (wired at the OnboardingShell level so focus doesn't matter).
- **The committed-state success card** — renders for
  `gate.status === "committed"`, with the body copy + Continue CTA
  varying by `method` (`register` vs `engineer-call`).

## What this widget does NOT own

- **The form fields, validation, register call** — `SignUpWidget`
  in the viewer.
- **The viewer-side Calendly embed** — `BookCallView` viewer widget.
- **The composing/typing animation that precedes the gate appearing**
  — that's `GateChatPanel` in `views/Onboarding/`, which mounts this
  widget after the typing indicator finishes.

## Gate-state render rules

| `gate.status` | What renders                                                        |
| ------------- | ------------------------------------------------------------------- |
| `idle`        | `null`                                                              |
| `open`        | Eyebrow + preamble + book-a-call + dismiss                          |
| `committed`   | Success card (varies by `method`) + Continue CTA (onboarding only)  |
| `dismissed`   | `null`                                                              |

## Locked affordances under `mode="onboarding"`

Onboarding mode is the default; both `onboarding` and `steady` share
the same rendering rules today. Future steady-mode affordances may
diverge (e.g. a "swap signed-in account" affordance that doesn't
belong in the onboarding gate). The prop exists so the divergence
has a clean home when it lands.

## Events

- Book-a-call CTA → sets `?bookCall=1` on the URL (the
  OnboardingShell sees the param and swaps the viewer to the
  `BookCallView` widget).
- "← Keep exploring" link → calls `dismissGate()` from
  `OnboardingSessionContext`. ESC at the shell level fires the same
  action.
- Continue-to-Integrate CTA (committed state, onboarding only) →
  advances the frame via `advanceFrame("f7")`.

## How to mount

```tsx
import { GateChatRail } from "@/components/chat-widgets/GateChatRail/GateChatRail";

// OnboardingShell mounts this whenever gate.status !== "idle".
<GateChatRail mode="onboarding" />
```

The composing animation that precedes the rail appearing lives in
`views/Onboarding/GateChatPanel.tsx` — it mounts the rail after the
typing indicator finishes.

## LLM tools

`GateChatRail.tools.ts` exposes two mutate-category tools
(widget-llm-integration follow-up B.2, 2026-05-28):

- `commit_gate({ method })` — commit the active gate via
  `register` / `sso` / `engineer-call`. Use when the user has
  explicitly chosen the path forward.
- `dismiss_gate()` — close the gate without committing. Use when
  the user wants to keep exploring.

Both are mutate-category, so the chat router surfaces them on
`reply.suggestedActions[]` as user-confirmable chips per
`design.md` §C. Clicking the chip dispatches `commitGate(method)` /
`dismissGate` intents that the orchestrator routes through
`OnboardingSessionContext`. The existing rail CTAs (register form,
"← keep exploring" link) keep working unchanged — the tools just
let the LLM surface the same actions as suggestions.
