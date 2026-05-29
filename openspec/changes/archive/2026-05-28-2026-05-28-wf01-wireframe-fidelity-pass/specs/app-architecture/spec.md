# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: F1 overlay SHALL hide the underneath shell from assistive tech

The F1 IngestView overlay SHALL render as a full-viewport opaque pane covering the underneath AppShell, AND the underneath AppShell wrapper MUST be marked `aria-hidden="true"` and `inert` while the F1 overlay is mounted, so that screen readers and keyboard navigation do not surface the masked-out sidebar and chat-pane elements. The visual F1 chrome (no nav, no chat pane visible) is already achieved by the overlay; this requirement closes the a11y leak.

#### Scenario: F1 a11y tree exposes only the IngestView

- **GIVEN** the user is on `/onboarding` with `session.currentFrame === "f1"`
- **WHEN** assistive tech walks the page
- **THEN** the underneath shell wrapper has `aria-hidden="true"`
- **AND** the underneath shell wrapper has the `inert` attribute
- **AND** keyboard Tab does NOT focus elements inside the underneath shell.

#### Scenario: F2 restores the shell to the a11y tree

- **GIVEN** the frame transitions from f1 to f2
- **WHEN** the F1 overlay unmounts
- **THEN** the underneath shell wrapper has neither `aria-hidden` nor `inert`
- **AND** the sidebar nav, chat pane, and step strip are all reachable by assistive tech.

### Requirement: Step-strip sub-pills SHALL be keyboard-navigable when reachable

The step-strip Extract / Interact / Report sub-pills SHALL each render with `role="button"`, `tabindex="0"` when reachable, and an `onClick` handler that advances the canvas to the corresponding frame. Disabled
sub-pills MUST carry `aria-disabled="true"` and MUST NOT receive
focus. The current implementation renders them as plain `<div>`s with
no role / no handler, which blocks F3↔F5 navigation via the step
strip.

#### Scenario: Reachable sub-pill is clickable + focusable

- **GIVEN** the user has reached the Analyze step (Extract is the active sub-step)
- **WHEN** the step strip renders
- **THEN** the `Extract` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** the `Interact` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking `Interact` advances the canvas to F5 InteractView.

#### Scenario: Locked sub-pill is not focusable

- **GIVEN** the user is logged out and Report is sign-in-gated
- **WHEN** the step strip renders
- **THEN** the `Report` sub-pill has `aria-disabled="true"` and `tabindex="-1"`
- **AND** keyboard Tab does NOT focus it
- **AND** clicking it does not advance the frame.

### Requirement: Onboarding URL paths SHALL not throw the error boundary

A user landing on `/onboarding/:bucketId/:scenarioId/{any}` SHALL NOT
trigger the AppErrorBoundary. The router MUST either define routes
for the canonical sub-step paths (`/ingest`, `/understand`, `/extract`,
`/interact`, `/integrate`) that hydrate the matching frame, OR
redirect any unknown sub-path to the canonical `/:bucketId/
:scenarioId` URL while preserving session state. Today
`/onboarding/28454/utility/interact` renders "Something went wrong".

#### Scenario: Direct sub-step URL hydrates the right frame

- **GIVEN** the user navigates directly to `/onboarding/28454/utility/interact`
- **WHEN** the app loads
- **THEN** the error boundary does NOT fire
- **AND** either the InteractView is rendered (route defined) OR the user is redirected to `/onboarding/28454/utility` with the same session.

#### Scenario: No `No routes matched` console warning

- **GIVEN** the user navigates to any documented onboarding URL
- **WHEN** the page settles
- **THEN** the browser console contains no `No routes matched location` warning for that URL.

> The F1→F2 animation choreography is intentionally left flexible — the
> current implementation uses an F1 overlay that lifts away (700ms) while
> the underneath shell zooms back to identity, which is functionally
> equivalent to the canonical "nav + chat slide in from the left." The
> overlay approach was chosen so the underneath AppShell can stay mounted
> across the transition (avoids re-running AnimatePresence on nav+chat).
> Both shapes satisfy the user-visible contract: F1 → F2 takes ~700ms,
> respects reduced-motion, and lands the shell + step strip + chat
> visible at F2.
