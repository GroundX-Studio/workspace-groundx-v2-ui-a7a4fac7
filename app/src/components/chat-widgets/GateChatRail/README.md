# GateChatRail

Chat-slot widget for the sign-up gate. The viewer-side companion is
`viewer-widgets/SignUpWidget/`.

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
