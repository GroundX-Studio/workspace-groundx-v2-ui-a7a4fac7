# BookingStatusCard

**Slot:** `chat-widgets` · **Status:** shipped (renamed from
`BookCallChatPanel` in ARCH-03)

The compact "BOOKING IN PROGRESS" chat surface that pairs with
`viewer-widgets/BookCallView`. Mounted in the chat column while the
Calendly iframe is active in the viewer pane.

## What it does

Shows a green-bordered status card ("BOOKING IN PROGRESS / Book a 15-
min engineer call / pick a time on the right →") plus supporting cards
that:

- Reassure the user that ESC / × from the Calendly UI returns them
  here without losing session state
- Clarify "booking ≠ signing in" — magic-link is still available
- Outline what the call will cover (document type / volume / accuracy,
  GroundX-fit, pilot scope)
- Credibility blurb about the solutions engineer

Listens for the `calendly.event_scheduled` postMessage event from the
viewer's Calendly iframe. When fired (and origin-verified against
`https://*.calendly.com`), commits the gate to `engineer-call` and
swaps the chat card to a "Call booked" confirmation.

## Props

```ts
interface BookingStatusCardProps {
  /** Locked-affordance gate (widget contract). */
  mode?: "onboarding" | "steady";  // defaults to "onboarding"
}
```

## Locked affordances under `mode="onboarding"`

In onboarding the back-to-sign-in pill clears `?bookCall=1` and the
chat column reverts to the gate's main chat rail. In steady mode the
same back-out is allowed but the surrounding chat continues to operate
normally rather than gating the rest of the flow.

## Activation

Mounted by the OnboardingShell whenever `?bookCall=1` is present in
the URL, in tandem with the `BookCallView` viewer widget.

## Security note

`TRUSTED_CALENDLY_ORIGINS = /^https:\/\/([a-z0-9-]+\.)?calendly\.com$/i`
— anything else posting a message claiming to be Calendly is dropped.
Without this guard a malicious page in an iframe could fire a fake
`calendly.event_scheduled` to commit the gate.

## How to mount

```tsx
import { BookingStatusCard } from "@/components/chat-widgets/BookingStatusCard/BookingStatusCard";

// OnboardingShell mounts this in the chat column while ?bookCall=1
// is present in the URL.
<BookingStatusCard mode="onboarding" />
```

The viewer-side `BookCallView` (the Calendly iframe) is mounted in
parallel by the same shell.

## LLM tools

`BookingStatusCard.tools.ts` exposes one mutate-category tool
(widget-llm-integration follow-up B.3, 2026-05-28):

- `book_call()` — open the Calendly booking surface. Use when the
  user signals they want a human-assisted path forward (uncertainty
  about fit, complex documents, evaluation questions).

Mutate-category routing surfaces this as a confirmable chip on
`reply.suggestedActions[]`. The orchestrator handler sets
`?bookCall=1` on the URL; the OnboardingShell already watches that
param to mount `BookCallView` in the viewer + `BookingStatusCard`
in the chat. The user clicks the chip to actually open the iframe —
no surprise context switches.

The Calendly `event_scheduled` postMessage still commits the gate
to `engineer-call`. That path is untouched by this upgrade.

## Tests

`BookingStatusCard.test.tsx`. Covers: BOOKING IN PROGRESS rendering,
back-to-sign-in clears URL param, What-We'll-Cover bullets present,
"doesn't sign you in" copy, widget-contract data attributes,
postMessage commits gate, untrusted-origin postMessage dropped.
