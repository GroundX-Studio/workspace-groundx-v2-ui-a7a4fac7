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
  /** Widget access role (widget contract). REQUIRED. */
  role: WidgetRole;             // "anonymous" | "member"
  /** Required scope (widget contract). Always { type: "none" }. */
  scope: WidgetScope;
}
```

## Locked affordances (read-only roles)

**None.** BookCallView is available to ALL roles (anonymous + member,
per `docs/agents/widget-access-matrix.md`) and locks no affordance by
role — the Calendly booking surface renders identically for both. The
`role` prop is carried for widget-contract conformance and future roles.

The surrounding chrome (close button, breadcrumbs, canvas pane vs.
settings drawer) is the **host's** concern, driven by layout/flow — this
was the old `mode` prop's only job and was deliberately re-sourced to the
host rather than renamed to `role`.

## Scope

`{ type: "none" }`. BookCallView is **not** a ScopedViewerWidget — it
operates on no document set, so it always declares the explicit "none"
scope required by the widget contract.

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

## Events

This widget emits **no app-level events**. Booking happens entirely inside the
embedded Calendly iframe (Calendly posts back to its own service); the widget
neither lifts an `on*` callback nor dispatches a tool, and it does not itself
listen for Calendly's `event_scheduled` postMessage. The chat-side status of a
booking is owned by **BookingStatusCard** (the `book_call` tool). When
`VITE_CALENDLY_URL` is unset the widget renders an inline empty-state instead of
the iframe — still no event.

## How to mount

```tsx
import { BookCallView } from "@/components/viewer-widgets/BookCallView/BookCallView";

// OnboardingShell mounts this in the viewer pane while ?bookCall=1
// is present in the URL. `role` comes from the session (useWidgetRole);
// `scope` is always the explicit "none" scope.
<BookCallView role={role} scope={{ type: "none" }} />
```

The chat-side `BookingStatusCard` is mounted in parallel by the same
shell so the user has a back-out affordance.

## LLM tools

See [`no-llm.md`](./no-llm.md). The booking action happens inside a
third-party iframe (Calendly); the widget itself has no in-app
surface beyond mounting/unmounting.

## Tests

`BookCallView.test.tsx`. Mounts under both roles (`anonymous` +
`member`) and asserts the matrix row: iframe URL/src, a11y title,
fallback placeholder when env unset, widget-contract data attributes
(`data-role` propagation), and identical render across roles (no
affordance lock).
