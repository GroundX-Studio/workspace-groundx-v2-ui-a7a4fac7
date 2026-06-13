# GateChatRail

Legacy chat-slot widget for the retired chat-side sign-up gate. The live
sign-in path now renders `viewer-widgets/SignUpWidget/` as a viewer overlay
and keeps `ConversationFlow` mounted in the chat column.

## What it does

Historically rendered the chat-side mirror of the sign-up gate: an eyebrow +
per-trigger preamble + a book-a-call CTA + a dismiss link while
`gate.status === "open"`; a committed-state success card once the user signed
up or booked. It is retained for archival tests/tool metadata and is not
mounted by `ChatColumn` in the live onboarding route.

## Why split from `GateView`?

See `viewer-widgets/SignUpWidget/README.md` § "Why split from
`GateView`?". Short version: the old monolith stuffed form fields,
gate preamble, dismiss links, and a book-a-call CTA into the chat
column and left the viewer rendering whatever sample doc the user
came from. Splitting lets the OnboardingShell wire the viewer to the
form INSTEAD of leaving the sample in place.

## Props

| Prop    | Type          | Required | Notes                                                                                              |
| ------- | ------------- | :------: | -------------------------------------------------------------------------------------------------- |
| `role`  | `WidgetRole`  |   yes    | Widget access role (`"anonymous"` \| `"member"`). Present for the role+scope contract. No affordance is locked by role here — availability is anonymous-only and enforced at the mount site (see below). |
| `scope` | `WidgetScope` |   yes    | Always `{ type: "none" }` — this widget is session/gate-scoped, not document-scoped.               |

The committed-state **Continue-to-Integrate** nav CTA is NOT a prop — it is
onboarding-FLOW chrome re-sourced from gate-state (`state.currentFrame === "f6"`,
the gate frame). A steady re-encounter of the gate is off that frame, so the
nav CTA is absent (2026-05-30-widget-role-access).

## What this widget owns

- **The eyebrow** — `SIGN UP` while open; `WELCOME — YOU'RE SIGNED IN`
  / `THANKS - CALL REQUESTED` once committed.
- **The preamble** — chooses per `gate.trigger`:
  - `save` → "Save your work to come back to it. One quick step."
  - `export` → "Export uses your account so it's tied to you…"
  - `byo` → "Bring your own data. Sign in to start uploading."
  - `threshold` → "You've reached the free-tier ceiling…"
- **The book-a-call CTA** — sets `?bookCall=1` in the URL. The
  OnboardingShell sees the param and overlays the Calendly embed
  (`BookCallView` widget) on the active viewer while the current chat
  timeline remains mounted.
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
- **The live sign-in form, close/back control, and book-a-call entry** —
  those live on `SignUpWidget`.
- **The composing/typing animation that preceded this legacy rail** —
  that belonged to the legacy `GateChatPanel` composite.

## Gate-state render rules

| `gate.status` | What renders                                                        |
| ------------- | ------------------------------------------------------------------- |
| `idle`        | `null`                                                              |
| `open`        | Eyebrow + preamble + book-a-call + dismiss                          |
| `committed`   | Success card (varies by `method`) + Continue CTA (only on the gate frame `f6`)  |
| `dismissed`   | `null`                                                              |

## Locked affordances (read-only roles)

**None.** No affordance in this widget is locked or hidden by `role`
today. The widget is **anonymous-only by AVAILABILITY** — the
legacy gate host mounted it only in the gate (anonymous) context, so a
signed-in `member` never sees it; that constraint is enforced at the
mount site, not by a prop inside this widget. The `role` prop is
present for the role+scope contract and for forward-looking roles
(e.g. `viewer`/`editor`); should a future role need a divergent
affordance, the lock lands here and is asserted by this widget's test.

## Scope

`{ type: "none" }` — GateChatRail is session/gate-scoped, not
document-scoped, so it declares the explicit `none` scope (it is not
one of the four ScopedViewerWidgets that take a real `ContentScope`).

## Events

- Legacy book-a-call CTA → sets `?bookCall=1` on the URL (the
  OnboardingShell sees the param and overlays the `BookCallView`
  widget on the active viewer).
- "← Keep exploring" link → calls `dismissGate()` from
  `OnboardingSessionContext`. ESC at the shell level fires the same
  action.
- Continue-to-Integrate CTA (committed state, only while the
  onboarding flow is on the gate frame `f6`) → advances the frame via
  `advanceFrame("f7")`.

## How to mount

```tsx
import { GateChatRail } from "@/components/chat-widgets/GateChatRail/GateChatRail";

// Legacy-only example. The live route mounts SignUpWidget in the viewer and
// keeps ConversationFlow in the chat column.
<GateChatRail role="anonymous" scope={{ type: "none" }} />
```

The legacy composing animation that preceded the rail lived in
`components/chat-widgets/GateChatPanel/GateChatPanel.tsx`.

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
