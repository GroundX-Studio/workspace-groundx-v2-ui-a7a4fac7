# BookCallView

**Slot:** `viewer-widgets` · **Status:** shipped

The Calendly inline scheduler that takes over the viewer pane for the F6a
"Book a call with an engineer" flow.

## Viewer chrome

Policy: `framed`

Content mode: `embed`

`OnboardingShell` wraps BookCallView with `ViewerWidgetFrame`, which owns
the Close booking action and the loading/status band. BookCallView owns only
the Calendly embed lifecycle, trusted scheduled-event handling, unset-url
placeholder, and mobile external-calendar fallback.

## What it does

Reads `APP_CONFIG.calendly.url` (sourced from the browser-safe
`VITE_CALENDLY_URL` env var), loads Calendly's official widget script +
stylesheet, and initializes an inline widget inside the viewer-owned
pane. When the URL is unset, renders a labeled placeholder instead of a
broken third-party surface.

For local development, copy the value from `app/.env.example` into ignored
`app/.env` or `app/.env.local`. For image builds, pass `VITE_CALENDLY_URL`
as a Docker build arg so Vite can bake the public URL into the static bundle.

The parent element is intentionally a plain container, not a
`calendly-inline-widget` auto-embed node. That class belongs to
Calendly's standard `data-url` embed path; this widget uses the advanced
`Calendly.initInlineWidget({ url, parentElement })` API so React controls
when the scheduler is mounted.

The chat counterpart is the normal `ChatColumn` / `ConversationFlow`.
When this widget is mounted as a viewer overlay, the active conversation
stays mounted and booking narration arrives as ordinary assistant
messages.

## Props

```ts
interface BookCallViewProps {
  /** Widget access role (widget contract). REQUIRED. */
  role: WidgetRole;             // "anonymous" | "member"
  /** Required scope (widget contract). Always { type: "none" }. */
  scope: WidgetScope;
  /** Browser-safe Calendly scheduling URL. Defaults to APP_CONFIG.calendly.url. */
  calendlyUrl?: string;
  /** Called after a trusted Calendly scheduled-event postMessage. */
  onScheduled?: () => void;
  /** Reports embed lifecycle so the host frame can place loading/status chrome. */
  onEmbedStateChange?: (state: BookCallEmbedState) => void;
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
At phone widths, the widget opens the same Calendly URL in a new tab
instead of forcing Calendly's inline desktop layout into a clipped pane.
Future steady-mode integration may activate from a settings menu.

## Replaces

The inline F6 gate's "Book a call" button used to commit the gate
directly to a non-functional `engineer-call` state. Now the button
opens this widget as a viewer overlay and leaves the current chat
timeline in place. The gate only commits when the user actually
completes a booking (Calendly fires the `calendly.event_scheduled`
postMessage). The shell then clears `?bookCall=1` so the call-requested
state is visible immediately.

## Events

This widget owns the Calendly embed lifecycle and listens for Calendly's
trusted `calendly.event_scheduled` postMessage. When that event arrives
from a Calendly origin, it calls `onScheduled`; the shell decides what app
state to mutate (OnboardingShell commits the `engineer-call` gate).

The widget does **not** expose LLM tools and does not let the app script
inside Calendly's cross-origin surface. When `VITE_CALENDLY_URL` is unset
the widget renders an inline empty-state instead of loading the third-party
embed.

## How to mount

```tsx
import { BookCallView } from "@/components/viewer-widgets/BookCallView/BookCallView";

// OnboardingShell mounts this in the viewer pane while ?bookCall=1
// is present in the URL. `role` comes from the session (useWidgetRole);
// `scope` is always the explicit "none" scope.
<BookCallView
  role={role}
  scope={{ type: "none" }}
  onScheduled={() => commitGate("engineer-call")}
  onEmbedStateChange={setBookCallEmbedState}
/>
```

The shell mounts this over the active viewer and keeps the current
conversation flow mounted in the chat pane.

## LLM tools

See [`no-llm.md`](./no-llm.md). The booking action happens inside a
third-party Calendly surface; the widget itself only mounts/unmounts the
inline scheduler and reports Calendly's scheduled event to its host.

## Tests

`BookCallView.test.tsx`. Mounts under both roles (`anonymous` +
`member`) and asserts the matrix row: inline widget initialization,
fallback placeholder when the URL is unset, widget-contract data
attributes (`data-role` propagation), trusted scheduled-event callback,
and identical render across roles (no affordance lock).
