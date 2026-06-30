# BookingStatusCard

**Slot:** `chat-widgets` · **Status:** legacy, kept for contract/history tests
(renamed from `BookCallChatPanel` in ARCH-03)

The compact "BOOKING IN PROGRESS" chat surface that originally paired
with `viewer-widgets/BookCallView`. The current booking flow keeps the
normal `ConversationFlow` mounted and opens `BookCallView` as a viewer
overlay instead; this component is retained until the legacy chat-card
contract can be retired deliberately.

## What it does

Shows a green-bordered status card ("BOOKING IN PROGRESS / Book a
30-minute engineer call / Choose a time in the calendar.") plus
supporting cards
that:

- Reassure the user that ESC or Close booking returns them to the
  current demo state without losing session state
- Clarify "booking ≠ signing in" — magic-link is still available
- Outline what the call will cover (document type / volume / accuracy,
  GroundX-fit, pilot scope)

The card does not listen to Calendly postMessages. `BookCallView` owns the
Calendly embed lifecycle and trusted scheduled-event handling, then tells
the shell through `onScheduled`; the shell commits the `engineer-call`
gate.

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
`docs/agents/widget-access-matrix.md` §1 + §2). The close-booking
control clears `?bookCall=1` for every role; `role` is accepted only to
satisfy the widget contract.

## Scope

`{ type: "none" }` — this is the chat-side mirror of the booking
status, not a document/bucket/group view, so it declares the
no-scope sentinel (matrix §1b). It takes no `documentId`/`bucketId`/
`projectId`.

## Activation

Not mounted by the current OnboardingShell booking path. `?bookCall=1`
now mounts `BookCallView` as a viewer overlay while the normal chat
timeline stays in place.

## Security note

The Calendly trust guard lives with the viewer embed helper
(`app/src/lib/calendlyEmbed.ts`) so the component that owns the third-party
surface also owns `calendly.event_scheduled` verification. This card stays
display-only and never commits gate state from `window.message` directly.

## Events

- **`book_call` (LLM tool)** — now surfaces through
  `SuggestedActionChips`; activating it opens the Calendly booking
  surface (`BookCallView` overlay / `?bookCall=1`).
- **Close booking** — clears the booking URL param and returns the user to
  whichever onboarding frame opened the scheduler (local navigation only,
  no tool).

No `on*` callback props: this legacy card is display-only. The current
flow is driven by the `book_call` tool catalog and viewer overlay host
callbacks, not by this component.

## How to mount

```tsx
import { BookingStatusCard } from "@/components/chat-widgets/BookingStatusCard/BookingStatusCard";

// Legacy contract-only mount. The current OnboardingShell booking path
// keeps ConversationFlow in the chat column.
<BookingStatusCard role={role} scope={{ type: "none" }} />
```

The viewer-side `BookCallView` (the Calendly inline scheduler) is now
mounted as an overlay on the active viewer.

## LLM tools

`BookingStatusCard.tools.ts` exposes one mutate-category tool
(widget-llm-integration follow-up B.3, 2026-05-28):

- `book_call()` — open the Calendly booking surface. Use when the
  user signals they want a human-assisted path forward, to speak with a
  team member, or to book a call with an engineer.

Mutate-category routing surfaces this as a confirmable chip on
`reply.suggestedActions[]`. The orchestrator handler sets
`?bookCall=1` on the URL; the OnboardingShell watches that param to
mount `BookCallView` as a viewer overlay while the chat timeline stays
mounted. The user clicks the chip to actually open the scheduler — no
surprise context switches.

The viewer owns the Calendly `event_scheduled` postMessage and reports the
trusted event to the shell through `onScheduled`.

## Tests

`BookingStatusCard.test.tsx`. Covers: BOOKING IN PROGRESS rendering,
availability with no affordance lock for both roles (`anonymous` +
`member`), close-booking clears URL param, What-We'll-Cover bullets
present, "doesn't sign you in" copy, widget-contract slot attribute
(and that the retired `data-mode` attribute is gone), and that Calendly
postMessages do not mutate gate state from the chat card.
