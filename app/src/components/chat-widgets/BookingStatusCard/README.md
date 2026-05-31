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
  /** Widget-contract authorization role. Available to BOTH roles. */
  role: WidgetRole;       // "anonymous" | "member"
  /** Widget-contract scope. Not document-scoped → { type: "none" }. */
  scope: WidgetScope;     // { type: "none" }
}
```

The retired binary `mode: "onboarding" | "steady"` was cosmetic-only
for this widget (it gated no affordance) and was dropped in
`2026-05-30-widget-role-access` Phase 2b. Behavior is identical across
roles.

## Locked affordances (read-only roles)

**None.** BookingStatusCard is available to both `anonymous` and
`member` and locks no affordance by role (matrix
`docs/agents/widget-access-matrix.md` §1 + §2). The back-to-sign-in
pill clears `?bookCall=1` for every role; `role` is accepted only to
satisfy the widget contract.

## Scope

`{ type: "none" }` — this is the chat-side mirror of the booking
status, not a document/bucket/group view, so it declares the
no-scope sentinel (matrix §1b). It takes no `documentId`/`bucketId`/
`projectId`.

## Activation

Mounted by the OnboardingShell whenever `?bookCall=1` is present in
the URL, in tandem with the `BookCallView` viewer widget.

## Security note

`TRUSTED_CALENDLY_ORIGINS = /^https:\/\/([a-z0-9-]+\.)?calendly\.com$/i`
— anything else posting a message claiming to be Calendly is dropped.
Without this guard a malicious page in an iframe could fire a fake
`calendly.event_scheduled` to commit the gate.

## Events

- **`book_call` (LLM tool)** — this card is the chat-side surface of the
  `book_call` tool; activating it opens the Calendly booking surface
  (`BookCallView` in the viewer / `?bookCall=1`).
- **Back control** — exposes a "back" affordance that returns the user to the
  prior sign-in surface (local navigation only, no tool).
- On a completed booking the card swaps to a "Call booked" confirmation surface.

No `on*` callback props: the card drives the flow through the `book_call` tool
catalog, not lifted callbacks.

## How to mount

```tsx
import { BookingStatusCard } from "@/components/chat-widgets/BookingStatusCard/BookingStatusCard";

// OnboardingShell mounts this in the chat column while ?bookCall=1
// is present in the URL. `role` comes from useWidgetRole() (Phase 3);
// `scope` is the no-scope sentinel for this chat-side card.
<BookingStatusCard role={role} scope={{ type: "none" }} />
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
availability with no affordance lock for both roles (`anonymous` +
`member`), back-to-sign-in clears URL param, What-We'll-Cover bullets
present, "doesn't sign you in" copy, widget-contract slot attribute
(and that the retired `data-mode` attribute is gone), postMessage
commits gate, untrusted-origin postMessage dropped.
