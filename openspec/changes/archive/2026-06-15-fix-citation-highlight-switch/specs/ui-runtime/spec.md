# Spec Delta — ui-runtime

## MODIFIED Requirements

### Requirement: CanvasOrchestrator SHALL handle the highlightCitation intent end-to-end

`CanvasOrchestratorContext` SHALL register a handler for
`{ kind: "highlightCitation", documentId, page, bbox?, tier?, regions? }` that:

1. Sets the active viewer step to a `doc-viewer` for `documentId`,
   reusing the current step when the documentId matches (mutation) or
   pushing a new step otherwise.
2. Records `{ page, bbox?, tier?, regions?, sourceCitationIndex? }` as a
   `highlight` slot on the `doc-viewer` step. `regions` is the canonical
   multi-region proof shape; `bbox`/`tier` are retained as the first-region
   alias.
3. Persists the mutation via the existing `patchChatSession` writer.

**Toggle:** when the intent is dispatched with `source: "user"` AND it matches
the active `doc-viewer` step's current highlight on the SAME `documentId` AND
the SAME full set of proof regions, the handler SHALL CLEAR the highlight
instead of re-applying it — so clicking the active citation chip again
dismisses the highlight (the doc page stays shown; only the overlay is
removed). The match SHALL compare the citation's WHOLE region set (page + box +
tier for every region), NOT just the first region's `{page, bbox}`: a
multi-region citation's first region is frequently a shared container box that
many DISTINCT citations on a tabular/list answer also start from, so a
first-box-only match misidentifies a different citation as a re-click and
wrongly clears it. A citation with a DIFFERENT region set — even one that
shares the active citation's first box — SHALL switch the highlight to its own
regions, never toggle off. For a legacy single-box citation (no `regions`), the
comparison falls back to its one `{page, bbox, tier}` region, so its toggle
behavior is unchanged. An `agent`-sourced highlight (the automatic "show the
answer's source") SHALL always set and never toggle.

The same whole-region-set identity SHALL govern the same-document mutation
short-circuit (the cheap re-click guard that suppresses redundant re-renders):
it SHALL suppress only a true re-click of the identical citation (same region
set), and SHALL NOT suppress a switch to a different citation that happens to
share the active one's first region box and region count.

The `CiteChip` component's existing dispatch SHALL no longer be
silent — the handler is the canonical sink. The pre-UI-04 Popover
fallback in `CiteChip` is RETIRED.

#### Scenario: Dispatching highlightCitation while showing a different document

- **GIVEN** the active viewer step is `doc-viewer(documentId: A)`
- **WHEN** `dispatch({ kind: "highlightCitation", documentId: "B", page: 3 })` fires
- **THEN** a new `doc-viewer(documentId: B, highlight: { page: 3 })` step is pushed
- **AND** the persisted viewer-state PATCH includes the new step

#### Scenario: Clicking the active citation again toggles the highlight off

- **GIVEN** the active `doc-viewer` step's highlight is `{ page: 3, regions: R }` for document A
- **WHEN** the user clicks that same citation chip again (`dispatch({ kind: "highlightCitation", documentId: A, page: 3, regions: R }, "user")`)
- **THEN** the step's `highlight` is cleared (no overlay) while the doc page A stays shown
- **AND** a subsequent identical user click re-applies the highlight

#### Scenario: Clicking a different citation that shares the first region box switches to it

- **GIVEN** the active `doc-viewer` step for document A has highlight regions `Ra = [{page 2, box X}, {page 2, box P}]`
- **AND** a different citation has regions `Rb = [{page 2, box X}, {page 3, box Q}]` — the SAME first box `X` and the same region count, but a distinct second region
- **WHEN** the user clicks the second citation chip (`dispatch({ kind: "highlightCitation", documentId: A, page: 2, regions: Rb }, "user")`)
- **THEN** the highlight SWITCHES to `Rb` (it is NOT cleared) and the viewer paints `Rb`'s regions
- **AND** the mutation short-circuit does NOT suppress the switch despite the shared first box and equal region count

#### Scenario: Agent auto-highlight never toggles

- **GIVEN** the active step's highlight already matches an answer's primary citation
- **WHEN** the auto-highlight dispatches it again with `source: "agent"`
- **THEN** the highlight remains set (it is NOT cleared)
