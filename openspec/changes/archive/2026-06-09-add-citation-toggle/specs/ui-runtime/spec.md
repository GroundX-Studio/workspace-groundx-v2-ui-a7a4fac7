# Spec Delta — ui-runtime

## MODIFIED Requirements

### Requirement: CanvasOrchestrator SHALL handle the highlightCitation intent end-to-end

`CanvasOrchestratorContext` SHALL register a handler for
`{ kind: "highlightCitation", documentId, page, bbox? }` that:

1. Sets the active viewer step to a `doc-viewer` for `documentId`,
   reusing the current step when the documentId matches (mutation) or
   pushing a new step otherwise.
2. Records `{ page, bbox?, sourceCitationIndex? }` as a `highlight`
   slot on the `doc-viewer` step.
3. Persists the mutation via the existing `patchChatSession` writer.

**Toggle:** when the intent is dispatched with `source: "user"` AND it matches
the active `doc-viewer` step's current highlight (same `documentId`, `page`, and
`bbox`), the handler SHALL CLEAR the highlight instead of re-applying it — so
clicking the active citation chip again dismisses the highlight (the doc page
stays shown; only the overlay is removed). A non-matching citation switches as
before. An `agent`-sourced highlight (the automatic "show the answer's source")
SHALL always set and never toggle.

The `CiteChip` component's existing dispatch SHALL no longer be
silent — the handler is the canonical sink. The pre-UI-04 Popover
fallback in `CiteChip` is RETIRED.

#### Scenario: Dispatching highlightCitation while showing a different document

- **GIVEN** the active viewer step is `doc-viewer(documentId: A)`
- **WHEN** `dispatch({ kind: "highlightCitation", documentId: "B", page: 3 })` fires
- **THEN** a new `doc-viewer(documentId: B, highlight: { page: 3 })` step is pushed
- **AND** the persisted viewer-state PATCH includes the new step

#### Scenario: Clicking the active citation again toggles the highlight off

- **GIVEN** the active `doc-viewer` step's highlight is `{ page: 3, bbox: B }` for document A
- **WHEN** the user clicks that same citation chip again (`dispatch({ kind: "highlightCitation", documentId: A, page: 3, bbox: B }, "user")`)
- **THEN** the step's `highlight` is cleared (no overlay) while the doc page A stays shown
- **AND** a subsequent identical user click re-applies the highlight

#### Scenario: Agent auto-highlight never toggles

- **GIVEN** the active step's highlight already matches an answer's primary citation
- **WHEN** the auto-highlight dispatches it again with `source: "agent"`
- **THEN** the highlight remains set (it is NOT cleared)
