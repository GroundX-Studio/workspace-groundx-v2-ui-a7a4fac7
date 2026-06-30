# Tasks - normalize-signin-gate-viewer-overlay

- [x] T1 - SEQUENTIAL - Add failing user-visible tests for single-session sign-in.
  - Add or update `app/src/views/Onboarding/OnboardingShell.test.tsx` so
    `/onboarding/signup` and F1 **Sign up** assert:
    - `data-testid="conversation-flow"` is mounted;
    - `GateChatPanel` / `GateChatRail` live test ids are absent;
    - a `sign-up` viewer overlay is present and the DOM contains
      `data-testid="sign-up-viewer-surface"`;
    - the viewer surface exposes `sign-up-viewer-close` and
      `sign-up-viewer-book-call`;
    - the active `chatSessionId` before and after sign-up entry is unchanged;
    - closing sign-in from no-sample state returns to the F1 picker;
    - F1-origin sign-up leaves the StepStrip anchored to Ingest, not
      a fake Understand state.
  - Add or update a sample-pick regression in the same file:
    - start on `/onboarding/signup`;
    - navigate to `/onboarding/<bucketId>/utility`;
    - assert the sign-up overlay is popped;
    - assert the same chat session now shows the Utility onboarding experience.
  - Add or update `app/src/components/chat-widgets/ChatColumn/ChatColumn.test.tsx`
    so an onboarding session with `gate.status === "open"` still renders
    `ConversationFlow` once the explicit `signInActive` prop is true.
  - Run:
    `npm --prefix app test -- OnboardingShell.test.tsx ChatColumn.test.tsx`
  - Expected before implementation: at least one assertion fails because the
    live gate path still renders or depends on `GateChatPanel`.
  - Adversarial review gate: prove the failing tests cover DOM behavior the
    user can see, not only a hook seam or mocked action call.

- [x] T2 - SEQUENTIAL - Make `/onboarding/signup` and F1 **Sign up** enter the AppShell chat/viewer split.
  - Modify `app/src/views/Onboarding/OnboardingShell.tsx`.
  - Derive a `signInActive` boolean from `viewer.overlays` and suppress the
    full-screen F1 overlay while `signInActive || bookCallActive`.
  - Pass `signInActive` to `ChatColumn` next to the existing `bookingActive`
    prop; do not make `ChatColumn` rediscover overlay state from unrelated
    contexts.
  - Set compact focus from blocking viewer overlays:
    `compactInitialFocus={signInActive || bookCallActive ? "focus-canvas" : undefined}`.
  - Preserve the underlying F1 viewer step when no scenario is active; do not
    mint a sample entity for sign-in.
  - Keep the existing `/onboarding/signup` URL -> overlay behavior, but stop
    using `openGate("byo")` as a reason for chat replacement.
  - Stop forcing the StepStrip to Understand merely because
    `gate.status === "open"`; derive the active pill from the underlying
    viewer step while sign-in is active.
  - Modify `app/src/views/Onboarding/IngestView/IngestView.tsx` only as needed
    so **Sign up** navigates to `/onboarding/signup` and does not create a new
    chat session.
  - Run:
    `npm --prefix app test -- OnboardingShell.test.tsx`
  - Adversarial review gate: verify F1 still loads full-bleed at `/onboarding`
    with no sign-in overlay and no chat pane, while `/onboarding/signup`
    reveals chat + viewer in the same session.

- [x] T3 - SEQUENTIAL - Retire live `GateChatPanel` routing from `ChatColumn`.
  - Modify `app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx`.
  - Add `signInActive?: boolean` to `ChatColumnProps`.
  - Remove the `gateActive -> <GateChatPanel />` branch from the live onboarding
    path.
  - Keep `ConversationFlow` mounted for:
    - active scenario journeys;
    - `signInActive === true` with no scenario;
    - booking overlay active;
    - post-gate committed confirmation messages.
  - Keep the pre-chat F1 idle state only for `/onboarding` with no active
    sign-in/book-call overlay.
  - Update or delete stale comments that describe `GateChatPanel` as the F2-F7
    chat host.
  - Run:
    `npm --prefix app test -- ChatColumn.test.tsx gate-chat-panel-placement.test.ts`
  - Adversarial review gate: search for remaining live imports/mounts with
    `rg "GateChatPanel|GateChatRail" app/src` and classify each hit as legacy
    test/docs/tool metadata or an implementation bug.

- [x] T4 - WORKFLOW - Consolidate live sign-in controls into the viewer widget.
  - Modify `app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.tsx`.
  - Add `data-testid="sign-up-viewer-surface"` to the live root and preserve
    existing form handles (`signup-first-input`, `signup-submit`, etc.).
  - Ensure the live viewer widget owns:
    - contextual heading/body for BYO vs save/export/threshold triggers;
    - register form submit;
    - magic-link/SSO affordances already supported by the repo, if retained;
    - **Book a call** action that routes to `?bookCall=1` and exposes
      `data-testid="sign-up-viewer-book-call"`;
    - contextual close action: **Back to samples** when no sample is active,
      **Close sign-in** when returning to an active viewer, exposed as
      `data-testid="sign-up-viewer-close"`;
    - post-commit **Continue to Integrate** when the gate commits on the gate
      frame, exposed as `data-testid="sign-up-viewer-continue-integrate"`.
  - If the form and surrounding gate surface need to split for readability,
    keep the public live widget viewer-slot only: either enhance
    `SignUpWidget` directly or move private form pieces under
    `SignUpWidget/` without introducing a second live chat-side gate surface.
  - Modify `app/src/components/viewer-widgets/SignUpWidget/README.md` and
    `SignUpWidget.test.tsx` to match the live viewer ownership.
  - Modify `app/src/components/viewer-widgets/GateValueProp/README.md` and
    tests if the widget becomes legacy-only or presentational-only.
  - Preserve `role="anonymous"` and `scope={{ type: "none" }}` at mount sites.
  - Run:
    `npm --prefix app test -- SignUpWidget.test.tsx GateValueProp.test.tsx widget-contract.test.ts`
  - Adversarial review gate: verify no form/action needed to finish sign-in is
    stranded in a chat-only widget that the live path no longer mounts.

- [x] T5 - WORKFLOW - Stream sign-in guidance into the normal chat timeline.
  - Modify `app/src/views/Onboarding/OnboardingShell.tsx` or the onboarding
    `ChatExperience` module, choosing the smaller integration point.
  - For UI-click entry (`/onboarding/signup` from F1), append staggered
    assistant turns to the active `ConversationFlow`:
    - "I opened sign-in in the viewer so you can bring your own documents into this same session."
    - "You can close sign-in to return to the current demo state, or book time with an engineer from the same viewer."
  - For LLM/tool-triggered entries, preserve the chat router's generated
    assistant answer and suggested actions; do not overwrite it with
    "I am opening the relevant view now".
  - Add duplicate suppression so refresh/back/re-render does not replay the
    same opener repeatedly. Suppression must inspect the active session's
    current messages after hydration, not only a component ref.
  - Run:
    `npm --prefix app test -- ConversationFlow.test.tsx OnboardingShell.test.tsx`
  - Adversarial review gate: inspect rendered bubbles in tests and ensure they
    are ordinary assistant turns inside `ConversationFlow`, not a separate
    panel or status card.

- [x] T6 - SEQUENTIAL - Preserve overlay stacking with Calendly.
  - Modify `app/src/views/Onboarding/OnboardingShell.tsx`.
  - Generalize the viewer stack underlay from book-call-only hiding to active
    blocking overlays: sign-in and book-call both hide/inert the underlay.
  - When book-call opens from sign-in, return to pending sign-in on close unless
    the booking commits the gate.
  - When booking commits the gate, clear `bookCall=1`, mutate or clear the
    sign-up overlay according to the committed flow, and keep the same chat
    session visible.
  - Keep Calendly's existing `?bookCall=1` viewer overlay behavior intact.
  - Run:
    `npm --prefix app test -- OnboardingShell.test.tsx BookCallView.test.tsx`
  - Adversarial review gate: verify there is never a second chat surface next
    to Calendly or sign-in, and that closing Calendly returns to the correct
    prior viewer state.

- [x] T7 - WORKFLOW - Update specs and agent docs after implementation.
  - Update `docs/agents/architecture.md`, `docs/agents/onboarding-flow.md`,
    `docs/agents/widget-contract.md`, and `docs/agents/data-model.md` where
    they still describe `GateChatPanel` / `GateChatRail` as the live sign-in
    chat host.
  - Update `app/src/test/gate-chat-panel-placement.test.ts` if its guard now
    protects only legacy placement, or replace it with a guard that bans live
    mounting from `ChatColumn`.
  - Run:
    `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate normalize-signin-gate-viewer-overlay --strict`
  - Adversarial review gate: search docs and specs for "chat-side gate",
    "GateChatPanel", "GateChatRail", and "back to sign-in"; any remaining
    reference must be explicitly legacy or updated.

- [x] T8 - SEQUENTIAL - Browser verification across widths.
  - Start the app with middleware:
    `MOCK_MODE=true APP_REPOSITORY_MODE=memory npm run dev`
  - Use Chrome DevTools MCP to verify:
    - desktop: `/onboarding` -> **Sign up** -> chat + sign-in viewer, no
      separate gate chat;
    - tablet: same flow with no overlap and readable close control;
    - mobile: sign-in foregrounds viewer, chat remains reachable, no duplicate
      session;
    - sample pick after close continues the same session;
    - save/export gate from a sample keeps the sample chat and opens sign-in
      in the active viewer;
    - Calendly still opens in the viewer and closes back correctly.
  - Capture screenshots or note viewport evidence in the implementation PR.
  - Adversarial review gate: compare the visuals against the user's reported
    failure mode: no separate chat window, no vague "here", no missing `x`,
    no fake proof claims, and no unsupported copy.
  - Evidence captured with Chrome DevTools MCP on 2026-06-12:
    - desktop sign-in: `tmp-signin-desktop-latest.png`;
    - desktop Calendly: `tmp-bookcall-desktop-latest.png`;
    - tablet sign-in: `tmp-signin-tablet-latest.png`;
    - tablet Calendly: `tmp-bookcall-tablet-latest.png`;
    - mobile sign-in: `tmp-signin-mobile-latest.png`;
    - mobile book-call fallback: `tmp-bookcall-mobile-latest.png`.
  - Verified F1 sign-up, sign-in to Calendly stacking, close booking back to
    sign-in, close sign-in back to F1, sample pick after close, sample-origin
    save/export sign-in, and compact chat toggles. Chat message counts remained
    one per sign-in/booking narration after reload.

- [x] T9 - SEQUENTIAL - Final verification and closeout.
  - Run:
    `npm test`
  - Run:
    `npm run build`
  - Run:
    `npm run test:e2e`
  - Run:
    `npm run scan:secrets`
  - Run:
    `npm run verify:preview`
  - Run:
    `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json`
  - Adversarial review gate: before marking this change complete, perform a
    fresh review of the final diff as if seeing it for the first time and
    explicitly challenge session identity, route/back behavior, widget slot
    ownership, and mobile layout.
  - 2026-06-12 final verification:
    - PASS: `npm test` (`app`: 204 files / 1674 tests; `middleware`: 55 files /
      908 tests);
    - PASS: `npm run build` (Vite chunk-size warning only);
    - PASS: `npm run test:e2e` with alternate Playwright ports because local
      listeners already owned the default dev ports (`48 passed`, `60 skipped`);
    - PASS: `npm run scan:secrets`;
    - PASS: `npm run verify:preview` (boot path passed; live-upstream flow
      skipped because no real `GROUNDX_PARTNER_API_KEY` was supplied);
    - PASS: `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate normalize-signin-gate-viewer-overlay --strict`;
    - PASS: `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json`
      (`27 passed`, `0 failed`);
    - PASS: adversarial review searched for stale live `GateChatPanel` /
      `GateChatRail` routing, vague close copy, fake proof copy, and separate
      chat surfaces. Remaining hits are legacy docs/tests or active regression
      guards; live `OnboardingShell` passes explicit `signInActive` /
      `bookingActive` to `ChatColumn`, keeps `ConversationFlow` mounted, and
      z-stacks sign-in/book-call as viewer overlays with inert underlays.
