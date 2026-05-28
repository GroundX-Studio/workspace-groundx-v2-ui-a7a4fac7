# Spec Delta — ui-runtime

## ADDED Requirements

### Requirement: PdfViewerWidget SHALL accept a controlled targetPage prop

`PdfViewerWidget` SHALL accept an optional `targetPage?: number` prop
that, when changed by the caller, navigates the widget to that page
on the next render. `targetPage` overrides `initialPage` and follows
prop changes via effect. Thumb clicks still update an internal
`activePage` (so the user can browse freely after a programmatic
jump); a subsequent change to `targetPage` re-overrides.

#### Scenario: Controlled page navigation

- **GIVEN** `<PdfViewerWidget documentId="X" targetPage={1} />` mounted
- **WHEN** the parent re-renders with `targetPage={7}`
- **THEN** the page image switches to page 7
- **AND** the active thumb's highlight ring follows

### Requirement: PdfViewerWidget SHALL render a citation highlight overlay

`PdfViewerWidget` SHALL render an absolutely-positioned highlight
`<Box>` over the active page image when passed an optional
`highlightBbox?: { x: number; y: number; w: number; h: number }`
prop (values are 0–1 page-relative coordinates), positioned at the
corresponding `left`/`top`/`width`/`height` percentages. When
`highlightBbox` is `null` or omitted, no overlay SHALL render.
The overlay carries `data-testid="pdf-viewer-highlight"` for
end-to-end coverage.

#### Scenario: Highlight overlay positioned proportionally

- **GIVEN** `<PdfViewerWidget ... highlightBbox={{x:0.1,y:0.2,w:0.5,h:0.05}} />`
- **WHEN** the widget renders
- **THEN** a `pdf-viewer-highlight` overlay is positioned at `10% / 20%` with `50% / 5%` dimensions over the active page image

### Requirement: CanvasOrchestrator SHALL handle the highlightCitation intent end-to-end

`CanvasOrchestratorContext` SHALL register a handler for
`{ kind: "highlightCitation", documentId, page, bbox? }` that:

1. Sets the active viewer step to a `doc-viewer` for `documentId`,
   reusing the current step when the documentId matches (mutation) or
   pushing a new step otherwise.
2. Records `{ page, bbox?, sourceCitationIndex? }` as a `highlight`
   slot on the `doc-viewer` step.
3. Persists the mutation via the existing `patchChatSession` writer.

The `CiteChip` component's existing dispatch SHALL no longer be
silent — the handler is the canonical sink. The pre-UI-04 Popover
fallback in `CiteChip` is RETIRED.

#### Scenario: Dispatching highlightCitation while showing a different document

- **GIVEN** the active viewer step is `doc-viewer(documentId: A)`
- **WHEN** `dispatch({ kind: "highlightCitation", documentId: "B", page: 3 })` fires
- **THEN** a new `doc-viewer(documentId: B, highlight: { page: 3 })` step is pushed
- **AND** the persisted viewer-state PATCH includes the new step

#### Scenario: Dispatching highlightCitation while showing the same document

- **GIVEN** the active viewer step is `doc-viewer(documentId: A, highlight: { page: 1 })`
- **WHEN** `dispatch({ kind: "highlightCitation", documentId: "A", page: 7, bbox: {...} })` fires
- **THEN** the same step's `highlight` is mutated to `{ page: 7, bbox: {...} }`
- **AND** no new step is pushed onto viewer-history
