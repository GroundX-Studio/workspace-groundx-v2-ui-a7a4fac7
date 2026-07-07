## ADDED Requirements

### Requirement: Viewer widgets SHALL share one centered blocking-load affordance

Every live viewer widget SHALL render its **blocking-load state** — the state where the widget
has no content to show yet (X-Ray not resolved, extraction schema not resolved, Calendly
iframe not yet initialized) — using ONE shared loading component. The shared component SHALL be
centered on both axes, present a single animation with the message rendered beneath it, and
accept the message as configuration. `PdfViewerWidget`, Extract, and `BookCallView` SHALL use
this component for their blocking-load state; none SHALL render a bespoke loader, a silent
blank body, or a loader that floats mid-pane. Progressive/ambient status over content that is
already present (e.g. the reading sweep over a rendered page, or a Calendly embed progressing
after its iframe mounts) SHALL remain in the frame status band, not the centered component.

#### Scenario: Extract blocking-load uses the shared centered loader

- **GIVEN** the Extract workbench mounts before its schema resolves
- **WHEN** the loading state renders
- **THEN** the shared centered loading component is shown with the extraction message
- **AND** the loader is not stretched to full height nor parked at the vertical middle by the
  frame body.

#### Scenario: PdfViewer blocking-load is not a silent blank

- **GIVEN** the PDF viewer mounts before its X-Ray resolves
- **WHEN** the loading state renders
- **THEN** the shared centered loading component is shown with a document-loading message
- **AND** the root still carries `data-loading="true"` and its accessible name.

#### Scenario: Calendly blocking-load uses the shared loader, progress uses the band

- **GIVEN** the booking viewer mounts before the Calendly iframe initializes
- **WHEN** the blocking state renders
- **THEN** the shared centered loading component is shown
- **AND** once the embed is present, further status appears in the frame status band, not
  floating over the embed.
