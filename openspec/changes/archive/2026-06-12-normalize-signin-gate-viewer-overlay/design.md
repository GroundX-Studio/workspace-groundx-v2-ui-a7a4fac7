# Design - normalize sign-in gate viewer overlay

## Product contract

There is exactly one active onboarding conversation. The user may enter it
from the main F1 picker, a sample, an LLM save/export intent, a sign-up URL,
or the book-call CTA. Those entries all reuse the same `ChatSession`.

The chat column is persistent. It streams assistant turns, tool responses,
suggested-action chips, and user messages. It does not become a separate
sign-in rail.

The viewer pane is transient. It can show the F1 picker underlay, a PDF,
Extract, Interact, Report, Integrate, Calendly, or sign-in. Sign-in is a
session-scoped overlay, not a content-scoped `ScopedViewerWidget`.

## Entry behavior

| Entry | Chat behavior | Viewer behavior | Close behavior |
| --- | --- | --- | --- |
| F1 **Sign up** | Reveal the normal onboarding chat and append a short sign-in opener. | Mount the sign-in overlay over the F1/main underlay. | Navigate to `/onboarding`; F1 picker returns. |
| `/onboarding/signup` | Same session, same `ConversationFlow`; no new chat is minted. | Push `{ kind: "sign-up", state: "pending" }`. | Navigate to `/onboarding` if no active sample; otherwise pop overlay in place. |
| Save/export/BYO/threshold gate | Preserve the active chat and use the LLM/router assistant text when the gate came from a chat turn. | Push or update the same sign-in overlay over the active viewer. | Pop overlay and continue on the active viewer step. |
| Pick sample while sign-in is active | Same chat session continues. | Pop sign-in overlay, activate the sample viewer step. | Standard sample navigation. |
| Book-call from sign-in | Same chat session continues. | Stack `book-call` above the pending `sign-up` overlay through `?bookCall=1`; Calendly remains viewer-only. | Closing Calendly pops only `book-call` and reveals pending sign-in. Scheduling commits the gate and clears booking. |

## Component responsibilities

| Unit | Responsibility |
| --- | --- |
| `OnboardingShell` | Composition root for URL state, viewer overlays, F1 overlay suppression, and AppShell focus. It renders the active viewer underlay plus sign-in/book-call overlays, computes `signInActive`, and passes that to chat. |
| `ChatColumn` | Always chooses `ConversationFlow` for onboarding sessions except the existing idle F1 state before the user enters chat. It receives explicit overlay booleans such as `signInActive` / `bookingActive`; it never renders `GateChatPanel` for live sign-in or infers chat behavior from `gate.status`. |
| `OnboardingSessionContext` | Keeps lifecycle methods (`openGate`, `dismissGate`, `commitGate`) but treats `gate.status` as lifecycle/analytics state, not a render-mode switch for chat. |
| `SignUpWidget` | Live viewer-side sign-in widget. It owns register/claim/promote/commit, close/back, magic-link/SSO affordances if retained, and the book-call entry point. If the implementation needs an internal split, keep it inside the widget directory and keep the live public surface viewer-slot only. |
| `GateChatPanel` / `GateChatRail` | Legacy gate chat widgets. They may remain to preserve test/tool history, but no live route or intent path should mount them. |
| `ConversationFlow` / onboarding experience | Normal assistant messages and optional staggered UI-click narration. LLM-triggered gate flows use the router's generated assistant text, not local replacement copy. |

## State model

`ChatSession.viewer.overlays` is the viewer source of truth:

```ts
{ kind: "sign-up", state: "pending" | "done" | "dismissed", cause?: "save-schema" }
```

The change should not add a new chat session id, a new flow mode, or a new
chat component. If a richer cause is required, extend the existing overlay
shape deliberately and mirror it wherever snapshots are parsed. Do not
introduce an unrelated gate context.

`gate.status` may still carry `idle | open | dismissed | committed` for
analytics and legacy lifecycle semantics. It must not decide whether
`ChatColumn` renders `ConversationFlow`.

The current step/StepStrip state is derived from the viewer underlay, not from
the sign-in overlay. F1-origin sign-up remains visually anchored to Ingest;
sample-origin sign-up preserves whichever sample step was active.

## Chat narration

Two sources feed the same timeline:

1. UI-only entry clicks, such as F1 **Sign up**, append a small staggered
   assistant opener to the active chat using `appendAgentMessage`.
2. Chat-router/tool-triggered gate opens preserve the LLM's generated reply
   and suggested actions. The client may append only a lightweight follow-up
   if the route changed without a visible assistant turn.

Duplicate suppression is keyed by `chatSessionId + overlay kind + trigger +
pathname`, so browser back/forward and React re-renders do not replay the
same opener.

Duplicate suppression must check the current session's rendered/persisted
messages, not only a React ref, so refresh and hydration do not append another
copy after history is restored.

## Navigation and back-out

Closing sign-in is contextual:

- no active sample: clear the overlay and navigate to `/onboarding`;
- active sample: pop the overlay and keep the URL/session on that sample;
- direct sample navigation from `/onboarding/signup`: pop the overlay before
  `pickScenario(...)` runs.

Copy should use concrete labels such as **Back to samples** or **Close
sign-in**, never vague text that references a missing `x` or "here".

The live viewer surface exposes stable handles for tests and accessibility:
`sign-up-viewer-surface`, `sign-up-viewer-close`,
`sign-up-viewer-book-call`, and `sign-up-viewer-continue-integrate` when
post-commit continue is visible.

## Responsive behavior

Desktop and tablet show the AppShell split: chat remains visible, sign-in
loads in the viewer pane.

Phone and narrow compact layouts foreground the viewer when sign-in opens,
with an explicit way to return to chat. The underlying chat session remains
mounted so messages are not lost.

## Verification target

The user-visible pass is:

- `/onboarding` -> **Sign up** shows chat + sign-in viewer in one session.
- Close returns to F1 picker.
- Pick Utility after close continues the same chat session.
- From a sample, save/export sign-in opens in the active viewer and chat stays
  `ConversationFlow`.
- `?bookCall=1` still overlays Calendly in the viewer without replacing chat.
