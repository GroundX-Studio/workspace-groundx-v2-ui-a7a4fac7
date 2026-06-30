# WF-09: Steady-mode canvas → live production widgets

## Why

Steady mode (the post-onboarding authenticated experience) renders a **placeholder** where the
document/extract/chat canvas should be — `SteadyShell.tsx:158` mounts
`steady-shell-canvas-placeholder` with a "pick a document" stub, and the file's own comment says
"Canvas slot still placeholder until RT-01..05." So the entire steady-mode canvas is mock. Per
`feedback_no_onboarding_duplicates.md`, steady mode must mount the SAME production widgets as
onboarding (PdfViewer / Extract / ChatWithSources / Report) with `mode="steady"` (no onboarding
locks) and live data for the active session's document/scope.

## What changes

The Steady canvas SHALL mount the production widgets for the active session document — the same
`PdfViewerWidget` / Extract / ChatWithSources path onboarding uses (WF-08), keyed off the steady
session's `documentId` + `ContentScope`, with editing affordances unlocked. The
`steady-shell-canvas-placeholder` is removed once a document is active; the empty "no document
selected" state remains only for the genuinely-empty case.

## Out of scope

- The onboarding-view rewire (WF-08) — this reuses the same widgets once they're live.
- New steady-mode features beyond mounting the live widgets.

## Affected

- App: `views/Steady/SteadyShell/SteadyShell.tsx` (mount live widgets, drop the canvas placeholder),
  tests.
- Specs: `ui-views` (steady canvas mounts live widgets).
