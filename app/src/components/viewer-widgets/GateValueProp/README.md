# GateValueProp

The **canvas (viewer-slot) half of the F6 sign-up gate**. Sibling to
`chat-widgets/GateChatRail`, which owns the sign-up doors.

## What it does

When the gate opens, the chat rail (`GateChatRail`) presents the three doors —
email "send magic link" · SSO · book-a-call — and the canvas mounts this widget:
an attractive, on-brand pitch of the GroundX value proposition. It replaced the
old in-canvas account form (P1, 2026-05-29) so sign-up is a chat moment and the
canvas reinforces *why* it's worth an account. Presentational only.

## Props

- `mode?: "onboarding" | "steady"` (default `"onboarding"`). Surfaced as
  `data-mode` on the root.

## Locked affordances

The pitch is identical in both modes — there are no interactive controls to lock.
The `mode` prop exists so the canvas can mount the widget uniformly per the widget
contract; it does not change behavior here.

## Events

None. The widget emits no events and takes no callbacks — the actionable gate
affordances (commit / dismiss) live in the sibling `GateChatRail`.

## How to mount

`OnboardingShell` mounts `<GateValueProp />` in the canvas slot whenever the
sign-up surface is active (`gate.status === "open" | "committed"`), in place of
the previous frame view.

## No LLM tools

Presentational — no tools. See `no-llm.md`. The gate's `commit_gate` /
`dismiss_gate` tools live on `GateChatRail`.

## Copy

product-brand-gtm aligned: echoes F1's "documents that break general-purpose AI"
framing and F7's "ship the same project to your stack" close.
