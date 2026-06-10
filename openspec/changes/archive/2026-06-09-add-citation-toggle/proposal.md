# Toggle a citation highlight off by clicking it again

## Why

Once a citation highlight is shown, there's no way to dismiss it — clicking the
same `[N]` chip again just re-applies the identical highlight (a no-op). Users
want to click the active citation a second time to turn the highlight off
completely.

## What changes

A **user** click on the citation that is already the active highlight clears it
(toggle off). Clicking it again re-applies it. Clicking a different citation
switches to that one (unchanged). The page stays in the viewer; only the
highlight overlay is removed.

This is scoped to **user** clicks (`CiteChip`). The automatic
"show the answer's source" highlight (dispatched with `source: "agent"`) always
sets and never toggles, so a new answer never accidentally clears its own
source.

Implementation: the orchestrator's existing `highlightCitation` handler gains a
source-aware toggle (it already receives `source` and can read the active
step's highlight), backed by a small `ChatStore.clearCitationHighlight` sink.

## Conformance to core architectural decisions

- **Principle 1 — composable, not forked.** No new component, intent kind, or
  axis. The behavior is folded into the existing `highlightCitation` handler
  using the `source` it already carries. No speculative abstraction.
- **Principle 5 — done = user-visible.** Done is a browser-verified toggle
  (click active chip → highlight gone; click again → back). The highlight is
  ephemeral viewer state; nothing new is persisted beyond the existing
  doc-viewer step mutation.
- **Principle 6 — one source of truth.** No new `@groundx/shared` type — reuses
  the existing `CanvasIntent` + dispatch `source`. Planning lives only in this
  change.
