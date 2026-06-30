# Spec Delta — ui-views

## ADDED Requirements

### Requirement: Steady-mode canvas SHALL mount live production widgets, not a placeholder

The Steady-mode canvas SHALL mount the live production widgets for the active session document and
SHALL NOT render a placeholder when a document is active. It MUST reuse the same
`PdfViewerWidget` / Extract / ChatWithSources path as onboarding, keyed off the steady session's
`documentId` and `ContentScope`, with `mode="steady"` so the onboarding locks are released. A
"no document selected" empty state MAY remain only when there is genuinely no active document.

#### Scenario: Active steady document renders the live viewer

- **GIVEN** a signed-in steady session with an active document
- **WHEN** the steady shell renders its canvas
- **THEN** the live `PdfViewerWidget` (fed by `getDocumentXray`) is mounted with `mode="steady"`
- **AND** the `steady-shell-canvas-placeholder` is not present.
