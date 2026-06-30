# Normalize sign-in gate as a viewer overlay

## What

Make sign-in/sign-up a viewer overlay inside the single active onboarding
chat session. Clicking **Sign up** from the F1 onboarding screen,
triggering `openGate(...)` from save/export/BYO/threshold flows, or landing
directly on `/onboarding/signup` SHALL reveal the normal chat timeline and
mount the sign-in surface in the viewer pane. The chat column SHALL NOT swap
to `GateChatPanel`, `GateChatRail`, or any other parallel gate chat.

## Why

The current gate splits the relationship between chat and viewer: the viewer
shows one surface while the chat column is replaced by a special gate panel.
That is the same product failure class the Calendly work corrected. Chat is
the user's durable relationship surface; the viewer is where transient widgets
load. Sign-in should follow that model.

## Scope

- Keep one `ChatSession` and one mounted `ConversationFlow` through F1 sign-up,
  sample selection, save/export gate triggers, Calendly booking, dismiss, and
  sign-up commit.
- Treat sign-in as `ViewerSession.overlays[]` state with `kind: "sign-up"`.
- Use the existing viewer widget contract for the live sign-in surface, with
  `role="anonymous"` and `scope={{ type: "none" }}`.
- Pass sign-in overlay activity to the chat composition root explicitly
  (`signInActive` or equivalent). `ChatColumn` SHALL NOT infer chat behavior
  from `gate.status`.
- Move gate narration into normal assistant turns in the shared conversation.
- Retire `GateChatPanel` / `GateChatRail` from the live sign-in route and
  intent paths; keep them only as archived/legacy code until removal is safe.
- Put every live sign-in action in the viewer surface: register/magic-link/SSO
  if supported, book-call, close/back, and post-commit continue. No required
  action may remain stranded in a chat widget the live path no longer mounts.
- Expose stable, user-visible test handles for the live viewer surface:
  `sign-up-viewer-surface`, `sign-up-viewer-close`,
  `sign-up-viewer-book-call`, and `sign-up-viewer-continue-integrate` when the
  continue action is visible. Existing form handles such as `signup-submit`
  remain valid.
- Make F1 **Sign up** enter chat + viewer mode without creating a second chat.
- Make close/back behavior deterministic:
  - no active sample -> return to `/onboarding` F1 picker;
  - active sample -> return to the active viewer step;
  - direct sample navigation -> pop sign-in and continue in the same session.
- Keep the step strip derived from the underlying viewer step. F1-origin
  sign-up remains on Ingest; sample-origin sign-up preserves the sample's
  current step.

## Out Of Scope

- Changing the auth backend, register endpoint, SSO provider wiring, or chat
  session claim API.
- Creating a new conversation engine, chat surface, or onboarding mode.
- Redesigning Workspace/Project signed-in chat.
- Changing Calendly beyond preserving its existing viewer-overlay behavior.
- Removing `GateChatPanel` / `GateChatRail` files in this change if tests or
  tool metadata still need a follow-up; the live path must stop mounting them.

## Conformance to core architectural decisions

| Principle | Plan |
| --- | --- |
| Composable, not forked | Reuse `ConversationFlow` and the existing `ViewerOverlay` axis. The new variation is the overlay value `sign-up`, not a second gate chat component. |
| Done = user-visible | Closure requires route-level tests plus Chrome verification at desktop, tablet, and mobile widths for F1 sign-up, sample pick, save-gate, dismiss, and Calendly coexistence. |
| One source of truth | `ChatSession` remains the parent record. `ViewerSession.overlays` owns the sign-in viewer state. `gate.status` remains lifecycle/analytics state only and SHALL NOT choose the chat surface. |

## User decision

Approved direction: **Option 1 - Single chat, viewer state changes.**
