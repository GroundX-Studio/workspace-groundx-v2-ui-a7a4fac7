# ProposeSchemaFieldCard

**Slot:** `chat-widgets` · **Status:** shipped (UI-01 Phase 2a, 2026-05-27)

The Accept/Reject card the chat column renders inline with the
assistant turn when the grounded LLM proposes adding a schema field.
Paired with `views/Onboarding/SchemaView.tsx` — Accept lands the field
in `pendingSchemaOverlay.addedFields` and SchemaView's overlay merge
surfaces it on the canvas immediately.

## What it does

Reads a server-validated `ProposedSchemaField` (from
`reply.proposedSchemaField` on the chat send response). Renders:

- "ADD FIELD" eyebrow + the proposed name + a CYAN type badge
  (STRING/NUMBER/DATE/BOOLEAN) + the LLM-generated description
- Accept (filled green) + Reject (outlined) buttons

On Accept:
- Mints a client-side id (`field_<slug>_<rand>`) and calls
  `useChatStore().addSchemaField()`. The action lands the addition in
  `pendingSchemaOverlay.addedFields` on the active session.
- Card swaps to a confirmation state ("FIELD ADDED · Added to the
  schema overlay. Save the template to keep it.") with the
  Accept/Reject controls removed so the user can't double-fire.
- **UI-01 Phase 2c**: Fires a focused extraction via `POST
  /api/extract-field` (fire-and-forget). The handler dispatches
  `setSchemaFieldExtraction(fieldId, { status: "pending" })` immediately
  so SchemaView's field card shows an "EXTRACTING" badge; on
  success it lands `{ status: "done", value, confidence, citation }`
  and the card shows the real extracted value. On any failure the
  status flips to `"error"` and the card surfaces "Couldn't extract".

On Reject:
- Card swaps to a dismissed state ("DISMISSED · Ask again any time to
  revisit."). No state mutation. The chat scroll retains the outcome.

## Props

```ts
interface ProposeSchemaFieldCardProps {
  /** Server-validated propose-field payload. */
  proposedField: ProposedSchemaField;
  /** Widget-contract mode flag. */
  mode?: "onboarding" | "steady";  // defaults to "onboarding"
}
```

## Locked affordances

The widget is mode-flagged for contract conformance; today its
behavior is identical in both modes. Future locking (e.g. "in steady
mode, Reject requires double-confirm") attaches here.

## Activation

Mounted by `chat-widgets/ChatColumn/ChatColumn` whenever an assistant
live-turn carries a non-null `proposedSchemaField`. The card sits
inline within the assistant bubble — sibling to the answer text.

## Tests

`ProposeSchemaFieldCard.test.tsx`. Covers: name/type/description
rendering, widget-contract data attributes, Accept dispatches and
swaps to confirmation, Reject swaps to dismissal.

## Pipeline upstream

The grounded LLM emits `proposedSchemaField` inside its fenced JSON
block when the user asks to add a field. `chatRouter.parseGroundedAnswer`
validates the shape (categoryId/name/description all strings; type ∈
{STRING|NUMBER|DATE|BOOLEAN}) and threads it onto
`ChatRouterResponse`. The chatHandler returns the router response
verbatim; the frontend sees it on `reply.proposedSchemaField`.
