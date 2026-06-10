# Tasks — add-citation-toggle

## Task 1 — Failing user-visible test first  [SEQUENTIAL]

In the orchestrator test: dispatch `highlightCitation` for citation C as
`source: "user"` (sets the doc-viewer highlight), then dispatch the SAME
citation again as `source: "user"` and assert the step's `highlight` is now
cleared (toggled off). Also assert an `agent`-sourced repeat does NOT clear.
Fails today (re-dispatch is a no-op).

**Adversarial review gate:** genuinely red for the right reason; asserts the
user-visible toggle (highlight present → absent), and that agent auto-highlight
is unaffected.

## Task 2 — Implement the toggle  [SEQUENTIAL]

Add `ChatStore.clearCitationHighlight()` (clears the current doc-viewer step's
`highlight`, no-op if none). In the orchestrator `highlightCitation` case: when
`source === "user"` AND the incoming citation matches the active step's
highlight (documentId + page + bbox), call `clearCitationHighlight()`; otherwise
`gotoDocViewer(...)` as before.

**Adversarial review gate:** agent-sourced highlights never toggle; a different
citation still switches; clearing leaves the doc page shown (only the overlay
goes); existing citation tests stay green; typecheck + lint + drift guards.

## Task 3 — Verify + close  [SEQUENTIAL]

Browser: click an active citation chip → highlight disappears; click again →
returns. Full `app` + `middleware` suites, lint, build green; `openspec
validate` clean; archive.

## Definition of done

Toggle works in the browser; suites/lint/build green; `openspec validate`
clean; change archived.
