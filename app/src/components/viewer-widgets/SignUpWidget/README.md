# SignUpWidget

Viewer-slot widget that hosts the GroundX sign-up surface while the
active chat remains mounted in `ConversationFlow`.

## Viewer chrome

Policy: `framed`

Content mode: `centered-panel`

`OnboardingShell` wraps SignUpWidget with `ViewerWidgetFrame`, which owns
Close sign-in / Back to samples chrome. SignUpWidget owns the identity form,
magic-link/SSO shortcuts, Book a call content action, validation, submit
pipeline, and post-commit Continue action.

## What it does

Renders sign-in in the viewer pane while the gate is open or the
`/onboarding/signup` route is active. Owns: preamble copy, book-a-call,
magic-link/SSO shortcuts, form field rendering + validation, the submit
pipeline (register → claim → promote → commitGate), and the in-flight
loading state.

## Why split from `GateView`?

Before ARCH-05, `GateView` was a ~400-line monolith that lived inside
the chat column and bundled the form fields, the gate preamble, the
"book a call" CTA, and the dismiss links. While the gate was open the
viewer (canvas) kept rendering whatever surface the user had just
left — a sample doc, the F1 picker, etc. Users saw a sample PDF
behind a sign-up form. That was the ARCH-05 motivating bug.

The current fix keeps the surface in the viewer slot. `OnboardingShell`
renders `SignUpWidget` as a viewer overlay and passes `signInActive` to
`ChatColumn`, so the chat remains the same `ConversationFlow` instead
of switching to a separate gate chat.

## Props

| Prop    | Type                       | Required | Notes                                                                                                       |
| ------- | -------------------------- | :------: | ----------------------------------------------------------------------------------------------------------- |
| `role`  | `WidgetRole`               |    ✅    | `"anonymous"` \| `"member"`. Widget-contract prop, forward-looking. Locks NO affordance here (see below).    |
| `scope` | `WidgetScope`              |    ✅    | Always `{ type: "none" }` — sign-up is not document-scoped. Declared for the contract; never read.           |
| `onBookCall` | `() => void`          |          | Host callback for opening the Calendly viewer overlay.                                                      |
| `onContinueIntegrate` | `() => void` |          | Host callback for post-commit Continue. Defaults to `advanceFrame("f7")`.                                   |

`WidgetRole` / `WidgetScope` come from `@groundx/shared`.

## Submit pipeline

In this exact order on a happy-path submit:

1. `POST /api/auth/register` — sets the session cookie.
2. `POST /api/chat-sessions/claim` — best-effort re-key of anon chat
   rows. Failures go to Sentry (`route=/api/chat-sessions/claim`,
   `stage=after-register`); the user is still signed up.
3. `promoteToSignedIn()` (from `AppModeContext`) — flips the in-app
   auth state.
4. `commitGate("register")` (from `OnboardingSessionContext`) — only
   when a gate is **awaiting commit** (`gate.status === "open"` or
   `"dismissed"`); tells the gate state machine the user committed via
   the register path so the committed state renders. When the gate is `idle`, register + promote
   still run but the gate is untouched. **Sourced from gate-state, not
   from `role`** — see "Locked affordances" below.

## Scope

`scope` is always `{ type: "none" }`. Sign-up is not a
ScopedViewerWidget — it operates on identity, not a document set. The
prop is declared to satisfy the widget contract and is never read.

## Locked affordances (read-only roles)

**None.** No affordance in this widget is gated by `role`. Per the
access matrix (`docs/agents/widget-access-matrix.md`), this widget's
affordance-lock stance is "none today"; the form renders identically
for `"anonymous"` and `"member"`. Identity actions are user-driven by
definition.

Note the two role concerns this widget does NOT mix up:

- **Availability** (a signed-in `member` never sees sign-up) is
  **anonymous-only** and enforced at the **mount site** (the view /
  gate-state decides whether to mount), NOT by a prop inside this
  widget.
- **The gate-commit side effect** is sourced from **gate-state**
  (`gate.status`), NOT from `role`. A gate `open`/`dismissed` →
  `commitGate("register")` on success; a gate `idle` → no commit;
  `committed` → render the celebration card. This is the "re-source,
  don't rename" rule (the retired `mode` did NOT mean a role).

## Events

- Form submit → register → claim → promote → (gate awaiting commit)
  commitGate. See § "Submit pipeline" above for the exact order +
  failure routing.
- Validation failures stay local to the form; no host callback fires.
- Magic-link and SSO shortcuts commit the gate in demo mode.
- Book-a-call routes through `onBookCall` when provided.

## How to mount

```tsx
import { SignUpWidget } from "@/components/viewer-widgets/SignUpWidget/SignUpWidget";

// OnboardingShell mounts this as a viewer overlay while sign-in is active
// (anonymous-only — availability is decided here, at the mount site).
<SignUpWidget
  role="anonymous"
  scope={{ type: "none" }}
  onBookCall={handleSignInBookCall}
  onContinueIntegrate={handleSignInContinue}
/>
```

## LLM tools

See [`SignUpWidget.tools.ts`](./SignUpWidget.tools.ts). One mutate-category
tool: `submit_signup`. It does NOT auto-run — mutate tools surface a
confirmable chip, so the user still confirms before the account is created
(the historical authentication-fraud concern that previously made this widget
opt out). The middleware `SERVER_TOOL_CATALOG` intentBuilder emits a
`submitSignup` CanvasIntent carrying the collected fields; the widget registers
a matching orchestrator adapter that
runs the SAME register → claim → promote → commitGate sequence the submit
Button invokes. The five form inputs stay `noTool` with the reason
"value collected by submit_signup" (their values are arguments of the tool,
not separately LLM-drivable controls).

(Added 2026-05-31-tool-system-completion wf04 §1; replaced the prior
`no-llm.md` opt-out.)
