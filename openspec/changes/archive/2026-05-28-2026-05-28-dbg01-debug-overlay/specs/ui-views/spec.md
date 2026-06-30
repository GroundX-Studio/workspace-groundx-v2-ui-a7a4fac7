# Spec Delta — ui-views

## ADDED Requirements

### Requirement: The chat scroll container SHALL reserve a scrollbar gutter

The ChatColumn message scroll container SHALL use `scrollbar-gutter: stable` plus
right padding so the vertical scrollbar reserves its own gutter instead of painting
over the message bubbles. This applies to both ChatColumn scroll containers (the
onboarding and steady variants).

#### Scenario: Scrollbar does not overlay chat bubbles

- **GIVEN** a chat conversation tall enough to scroll
- **WHEN** the chat column renders its scroll container
- **THEN** the container has `scrollbar-gutter: stable`
- **AND** message bubbles are not visually overlapped by the scrollbar.

### Requirement: The PDF SHALL be reachable in compact layout

In compact single-pane layout the onboarding canvas SHALL be reachable via the "View canvas" toggle, and when revealed it MUST mount at a non-zero width so the PdfViewerWidget on F2/F3/F5 renders at a usable size rather than crushed to a sliver.

#### Scenario: Compact "View canvas" reveals a usable PDF

- **GIVEN** the user is on F2 in compact layout (chat pane shown)
- **WHEN** they activate the "View canvas" toggle
- **THEN** the canvas pane mounts with `data-testid="appshell-canvas"`
- **AND** it contains a `pdf-viewer-widget`
- **AND** the canvas pane width is non-zero (the PDF renders at a usable size).
