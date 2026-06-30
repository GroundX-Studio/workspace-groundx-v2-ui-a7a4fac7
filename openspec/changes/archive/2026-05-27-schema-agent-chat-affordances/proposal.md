# Schema-Agent chat affordances

## Why

Spec (`v2-dashboard/spec-flow.jsx::Flow_EditSchema`, lines 977-1007)
gives the F3a left-pane chat three affordances that the generic
ChatColumn doesn't have:

1. A **`Schema Agent` header** with the agent name + a **sample switcher**:
   `sample: Utility Bill · switch ▾`
2. An **earlier-turns compaction summary** at the top of the
   conversation when prior turns have been folded:
   `▾ earlier turns (<P> proposals · <A> fields accepted)`
3. After a field rerun, the agent's reply bubble appends a
   **confidence-delta line**:
   `Re-ran on the sample: <value> · confidence <new> ↑ from <old>`

These cue the user that they're in a focused agent loop (not the
general assistant), let them see how much history is hidden, and
make the per-field rerun's effect on extraction quality legible.

## What changes

- ADD a frame-conditional header to ChatColumn: when `currentFrame === "f3a"`,
  render the Schema-Agent header above the conversation with sample
  switcher chip.
- ADD an earlier-turns summary node that renders when the conversation
  has >N visible turns AND compaction summaries exist on the active
  session. Reads from `ChatSession.summaries` (existing slot).
- WHEN a per-field rerun completes (extraction `done` with a
  `previousConfidence` delta — see `expand-inline-editor-fields`),
  ChatColumn appends an agent bubble:
  `Re-ran on the sample: <value> · confidence <new> ↑ from <old>`.
- WIRE: SchemaView's `↻ Rerun` handler fires a ChatStore action
  `appendAgentMessage` with a templated message body when the
  extraction returns.

## Out of scope

- Building the conversation-compaction pipeline itself (it already
  exists). Just consume its summaries here.

## Affected

- Scaffold: `ChatColumn.tsx`, `SchemaView.tsx`, `ChatStoreContext.tsx`
  (new `appendAgentMessage` action).
- Requirement: `Schema-Agent chat affordances SHALL surface earlier-turns + confidence delta`.
