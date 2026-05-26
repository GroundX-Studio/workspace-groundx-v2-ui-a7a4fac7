# SignUpWidget

Viewer-slot widget that hosts the GroundX sign-up form. The chat-side
companion is `chat-widgets/GateChatRail/`.

## Why split from `GateView`?

Before ARCH-05, `GateView` was a ~400-line monolith that lived inside
the chat column and bundled the form fields, the gate preamble, the
"book a call" CTA, and the dismiss links. While the gate was open the
viewer (canvas) kept rendering whatever surface the user had just
left — a sample doc, the F1 picker, etc. Users saw a sample PDF
behind a sign-up form. That was the ARCH-05 motivating bug.

The fix: split the surface across the two slot widgets. Viewer hosts
the form; chat hosts the preamble + dismiss + book-a-call. The
OnboardingShell wires both whenever `gate.status === "open"` so the
viewer flips to the form INSTEAD of leaving the sample in place.

## Props

| Prop   | Type                          | Default        | Notes                                                                             |
| ------ | ----------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `mode` | `"onboarding"` \| `"steady"`  | `"onboarding"` | Onboarding fires `commitGate("register")` on success; steady promotes auth only.  |

## Submit pipeline

In this exact order on a happy-path submit:

1. `POST /api/auth/register` — sets the session cookie.
2. `POST /api/chat-sessions/claim` — best-effort re-key of anon chat
   rows. Failures go to Sentry (`route=/api/chat-sessions/claim`,
   `stage=after-register`); the user is still signed up.
3. `promoteToSignedIn()` (from `AppModeContext`) — flips the in-app
   auth state.
4. `commitGate("register")` (from `OnboardingSessionContext`) — only
   in `mode="onboarding"`; tells the gate state machine the user
   committed via the register path so the `GateChatRail` shows the
   "WELCOME — YOU'RE SIGNED IN" success card.

## What this widget intentionally does NOT do

- **The preamble** ("Bring your own data" / "Save your work") — lives
  in `GateChatRail` because it explains *why* sign-up is happening
  and that explanation is a chat concern, not a form concern.
- **The book-a-call CTA** — lives in `GateChatRail` (chat-side
  affordance per the wireframe).
- **The "← keep exploring" dismiss link** — lives in `GateChatRail`
  (chat-side, same reason).
- **The committed-state success card with Continue-to-Integrate CTA**
  — lives in `GateChatRail`. This widget shows the FORM. When
  `gate.status === "committed"`, the OnboardingShell unmounts this
  widget (the user doesn't need to re-see the form they just submitted).
