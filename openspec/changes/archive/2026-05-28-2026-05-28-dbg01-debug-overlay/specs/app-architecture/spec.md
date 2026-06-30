# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: A debug overlay SHALL render on `?debug=true` with a reset control

The app SHALL mount a `DebugOverlay` that renders only when the URL carries
`?debug=true`, as a fixed bar pinned along the bottom of the viewport above all app
chrome. The overlay MUST be visually distinct from product UI (intentionally
off-brand styling) so it is never mistaken for a shipped surface, and MUST render
`null` when the param is absent (zero production cost). Its first control is a
**Reset** button.

#### Scenario: Overlay appears only with the debug param

- **GIVEN** the user loads any app route with `?debug=true`
- **WHEN** the page renders
- **THEN** a fixed bottom bar with `data-testid="debug-overlay"` is in the document
- **AND** it contains a "Reset" control.

#### Scenario: Overlay is absent without the param

- **GIVEN** the user loads the same route WITHOUT `?debug=true`
- **WHEN** the page renders
- **THEN** no element with `data-testid="debug-overlay"` is in the document.

### Requirement: The debug reset SHALL return the app to a first-time anonymous visitor

Clicking the debug overlay's Reset control SHALL restore the experience to "an
unauthenticated user seeing onboarding for the first time." The reset MUST: sign out
of any authenticated session; clear all app-owned client storage (the known
`localStorage` keys and the per-scenario `sessionStorage` thinking-stream replay
keys); clear the session + csrf cookies so the next request mints a fresh anonymous
id; and hard-navigate to `/onboarding` (F1) for a clean remount.

#### Scenario: Reset clears client state and lands on F1

- **GIVEN** an authenticated (or returning anonymous) user with cached chat width,
  a replayed thinking-stream flag, and an active session cookie
- **WHEN** they click Reset in the debug overlay
- **THEN** the auth session is cleared
- **AND** the app-owned `localStorage` + `sessionStorage` keys are removed
- **AND** the session/csrf cookies are expired so a fresh anon id is minted
- **AND** the browser navigates to `/onboarding`
- **AND** the F1 ingest picker renders with no replayed thinking-stream.

### Requirement: The debug reset SHALL remain exhaustive as session state grows

The reset MUST clear EVERY piece of session-scoped or per-visitor state the app
holds — across client storage (localStorage, sessionStorage, cookies, in-memory
contexts) and any server-side session-keyed records — such that no state survives to
leak into the "first-time visitor" experience. This is a **forward-binding
invariant**: any future change that introduces a new session-scoped storage key,
context, cookie, cache, or server session record MUST extend the reset to clear it
AND add/extend a reset test covering it, in the same change. A reset that misses
newly-added state is a regression, not an enhancement deferral.

The reset helper SHALL centralize this clearing in one module
(`lib/resetExperience.ts`) so there is a single place to keep in sync, and SHALL be
referenced from the agent docs as the canonical "what counts as session state" list.

#### Scenario: New session state added without updating reset fails its own test

- **GIVEN** a future change adds a new session-scoped storage key or context
- **WHEN** the reset is run
- **THEN** the new state is cleared by `resetExperience`
- **AND** a reset test asserts the new state is gone after reset
- **AND** the change is not considered done until both hold.

#### Scenario: After reset, no prior session state is observable

- **GIVEN** a fully-exercised session (auth, chat history, cached widths, entity
  registry, viewer steps, any feature caches)
- **WHEN** Reset runs and the app reloads at `/onboarding`
- **THEN** no pre-reset client storage, cookie, context value, or server
  session-keyed record is observable in the fresh experience.

### Requirement: AppShell SHALL not leave the canvas pane collapsed across a breakpoint change

When AppShell transitions from compact to desktop layout, it SHALL reset the focus
mode to `split` so the canvas pane renders at its normal share of the width and is
never left collapsed to a sliver (the failure mode where a compact "View canvas"
toggle, fired during a compact↔desktop flap, leaves the desktop canvas at ~24px).

#### Scenario: Compact→desktop restores a usable canvas

- **GIVEN** the layout is compact and the user toggled to the canvas pane
- **WHEN** the viewport crosses into desktop width
- **THEN** AppShell's focus mode resets to `split`
- **AND** the canvas pane renders at a non-trivial width (well above the chat-pane floor)
- **AND** any mounted PdfViewerWidget is visible rather than crushed.
