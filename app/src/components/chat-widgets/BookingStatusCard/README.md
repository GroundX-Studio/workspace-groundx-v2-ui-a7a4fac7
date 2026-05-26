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

## Tests

`BookingStatusCard.test.tsx`. Covers: BOOKING IN PROGRESS rendering,
back-to-sign-in clears URL param, What-We'll-Cover bullets present,
"doesn't sign you in" copy, widget-contract data attributes,
postMessage commits gate, untrusted-origin postMessage dropped.
