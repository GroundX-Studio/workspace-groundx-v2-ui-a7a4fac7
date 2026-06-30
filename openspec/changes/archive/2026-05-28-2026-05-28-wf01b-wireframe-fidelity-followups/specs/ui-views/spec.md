# Spec Delta — ui-views

## ADDED Requirements

### Requirement: F1 BYO row SHALL render the F1→F2 transition affordance pill

The F1 IngestView SHALL render a coral mini-pill below the BYO row label with the verbatim copy `↳ Sign up triggers F1→F2 transition + loads F6 gate inline in chat`. This makes the canonical "what happens when I sign up" path explicit to the user before they click. The pill is anonymous-only — signed-in users skip it.

#### Scenario: Anonymous user sees the F1→F2 affordance pill

- **GIVEN** the user is on `/onboarding` (F1) and not signed in
- **WHEN** the IngestView renders
- **THEN** an element with the text `↳ Sign up triggers F1→F2 transition + loads F6 gate inline in chat` is in the document
- **AND** the element renders below the `🔒 BRING YOUR OWN — SIGN UP FREE TO UNLOCK` label.

### Requirement: F5 InteractView SHALL paint litRegions on the canvas PDF from the latest assistant citations

The F5 InteractView canvas SHALL mount a `PdfViewerWidget` whose `litRegions[]` prop is derived from the citations on the latest assistant turn. The widget SHALL paint one region per citation, color-keyed: first citation green (primary), middle citations cyan, last citation coral (anomaly / contrast).

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user is on F5 and the latest assistant turn has 4 citations
- **WHEN** the canvas renders
- **THEN** the PdfViewerWidget mounts with `litRegions` of length 4
- **AND** the first region's color is `green`
- **AND** the last region's color is `coral`
- **AND** any middle regions are `cyan`.

#### Scenario: Empty / no citations renders no overlay

- **GIVEN** the latest assistant turn has zero citations
- **WHEN** the canvas renders
- **THEN** the PdfViewerWidget renders with an empty `litRegions[]`
- **AND** no `pdf-viewer-lit-region-*` elements appear.

### Requirement: F3 PDF viewer SHALL highlight the selected field's source region

The F3 ExtractView SHALL pass the selected field's first citation as `targetPage` + `highlightBbox` to the left-pane `PdfViewerWidget`, so the source region is visually cross-linked when the user clicks (or focus-pre-selects) a field card. When no field is selected, the viewer falls back to its uncontrolled default.

#### Scenario: Clicking a field card highlights its source page + bbox

- **GIVEN** the user is on F3 with the Utility scenario
- **WHEN** they click `field-row-amount_due`
- **THEN** the left-pane PdfViewerWidget renders with `targetPage` matching the field's first citation page
- **AND** the widget renders an element with testid `pdf-viewer-highlight` overlaying the citation bbox.

#### Scenario: No field selected leaves the viewer at its default

- **GIVEN** the user is on F3 with no field selected
- **WHEN** the viewer renders
- **THEN** no `pdf-viewer-highlight` overlay is in the document.
