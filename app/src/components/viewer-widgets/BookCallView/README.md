# BookCallView

**Slot:** `viewer-widgets` · **Status:** shipped

The Calendly embed that takes over the viewer pane for the F6a "Book a
call with an engineer" flow.

## What it does

Reads `VITE_CALENDLY_URL` from `import.meta.env`, renders a full-pane
iframe pointed at that URL with the a11y title required by WCAG 2.4.1.
When the env is unset, renders a labeled placeholder instead of a
broken empty iframe.

The chat counterpart is `chat-widgets/BookingStatusCard` — when this
widget is mounted in the viewer, that widget should be mounted in the
chat so the user has a "back to sign-in" affordance + booking-progress
status.

## Props

```ts
interface BookCallViewProps {
  /** Locked-affordance gate (widget contract). */
  mode?: "onboarding" | "steady";  // defaults to "onboarding"
}
```

## Locked affordances under `mode="onboarding"`

Currently identical to `mode="steady"`. The iframe is the same Calendly
booking surface in both modes; the difference is that the host renders
different chrome around it (chat panel vs settings drawer).

## Activation

Currently activated by the `?bookCall=1` URL param. The OnboardingShell
mounts this widget in the viewer slot whenever that param is present.
Future steady-mode integration may activate from a settings menu.

## Replaces

The inline F6 gate's "Book a call" button used to commit the gate
directly to a non-functional `engineer-call` state. Now the button
opens this widget in the viewer + `BookingStatusCard` in the chat, and
the gate only commits when the user actually completes a booking
(Calendly fires the `calendly.event_scheduled` postMessage).

## Tests

`BookCallView.test.tsx`. Covers: iframe URL/src, a11y title, fallback
placeholder when env unset, widget-contract data attributes (mode
propagation).
