# SignUpWidget

Viewer-slot widget that hosts the GroundX sign-up form. The chat-side
companion is `chat-widgets/GateChatRail/`.

## What it does

Renders the sign-up form in the viewer pane while the gate is open.
Owns: form field rendering + validation, the submit pipeline
(register → claim → promote → commitGate), and the in-flight loading
state. The chat-side rail carries the preamble, dismiss link, and
book-a-call CTA.

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

| Prop    | Type                       | Required | Notes                                                                                                       |
| ------- | -------------------------- | :------: | ----------------------------------------------------------------------------------------------------------- |
| `role`  | `WidgetRole`               |    ✅    | `"anonymous"` \| `"member"`. Widget-contract prop, forward-looking. Locks NO affordance here (see below).    |
| `scope` | `WidgetScope`              |    ✅    | Always `{ type: "none" }` — sign-up is not document-scoped. Declared for the contract; never read.           |

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
   the register path so the `GateChatRail` shows the "WELCOME — YOU'RE
   SIGNED IN" success card. When the gate is `idle`, register + promote
   still run but the gate is untouched. **Sourced from gate-state, not
   from `role`** — see "Locked affordances" below.

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

## How to mount

```tsx
import { SignUpWidget } from "@/components/viewer-widgets/SignUpWidget/SignUpWidget";

// OnboardingShell mounts this in the viewer pane while gate.status === "open"
// (anonymous-only — availability is decided here, at the mount site).
<SignUpWidget role="anonymous" scope={{ type: "none" }} />
```

The chat-side `GateChatRail` is mounted in parallel by the same shell.

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
