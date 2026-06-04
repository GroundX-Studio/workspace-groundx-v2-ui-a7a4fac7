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
  /api/extract-field` (fire-and-forget). The Accept action dispatches
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
  /** Widget-contract authorization role (anonymous | member). */
  role: WidgetRole;
  /** Widget-contract scope — always `{ type: "none" }` here. */
  scope: WidgetScope;
}
```

## Scope

`{ type: "none" }`. The card operates on the **draft template**
(`pendingSchemaOverlay.addedFields`), not a document set, so it is not
a ScopedViewerWidget and declares the `none` scope variant. See
`docs/agents/widget-access-matrix.md` §1b.

## Locked affordances (read-only roles)

**None.** Per the access matrix this card is available to ALL roles
(`anonymous` ✅ / `member` ✅) and locks no affordance by role —
both Accept and Reject render identically regardless of role. The
`role` prop is for contract conformance + forward-looking roles (e.g.
a read-only `viewer`); when such a role lands, its affordance row gets
added to the matrix and asserted by this widget's sibling test.

## Activation

Mounted by `chat-widgets/ChatColumn/ChatColumn` whenever an assistant
live-turn carries a non-null `proposedSchemaField`. The card sits
inline within the assistant bubble — sibling to the answer text.

## Events

- **Inbound** — rendered when an assistant turn carries a non-null
  `reply.proposedSchemaField` (the `propose_schema_field` tool / legacy fenced
  block).
- **Accept** (`propose-schema-field-accept`) → calls `useChatStore().addSchemaField()`
  (lands in `pendingSchemaOverlay.addedFields`), fires the fire-and-forget
  `POST /api/extract-field`, and swaps the card to its accepted-confirmation
  surface (accept/reject controls unmount so it can't double-fire).
- **Reject** (`propose-schema-field-reject`) → swaps to the dismissed surface;
  **no** state mutation.

No `on*` callback props: the card drives its outcome through `ChatStore` mutators
directly. The sibling `accept_proposal` / `reject_proposal` LLM tools are the
*agentic* auto-apply path (see "LLM tools"), distinct from these button clicks.

## How to mount

```tsx
import { ProposeSchemaFieldCard } from "@/components/chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard";

// ChatColumn mounts this inline within each assistant bubble that
// carries a non-null reply.proposedSchemaField:
{turn.proposedSchemaField && (
  <ProposeSchemaFieldCard
    proposedField={turn.proposedSchemaField}
    role={role}
    scope={{ type: "none" }}
  />
)}
```

`ChatColumn`'s F2 and Steady flows are the only production callers.

## LLM tools

`ProposeSchemaFieldCard.tools.ts` exposes three mutate-category tools
(widget-llm-integration follow-up B.1, 2026-05-28). All three surface
on `reply.suggestedActions[]` as user-confirmable chips:

- `propose_schema_field({ categoryId, name, type, description })` —
  the LLM-proposed addition. Replaces the legacy fenced-JSON
  `proposedSchemaField` envelope. Use when the user asks to capture
  an additional value.
- `accept_proposal({ proposalId })` — agentic auto-accept. Use only
  when an agent flow has high confidence the user wants the
  proposal applied. The user can still Reject via the inline card.
- `reject_proposal({ proposalId })` — agentic auto-reject. Use when
  the proposal doesn't fit the active scenario.

Round-trip: LLM emits tool call → middleware validates Zod schema →
chat router routes the call to `reply.suggestedActions[]` → the
`SuggestedActionChips` widget renders the chip → user click → app-
side `suggestedActionToIntent` dispatches the corresponding
`CanvasIntent` (`proposeSchemaField` / `acceptSchemaField` /
`rejectSchemaField`) → orchestrator routes to the matching
`ChatStore` mutator (`enqueueFieldProposal` / `acceptFieldProposal` /
`dismissFieldProposal`).

Back-compat: while A.4 consumer migration is in flight, the
middleware also mirrors a validated `propose_schema_field` call
onto `reply.proposedSchemaField` so the existing inline card render
keeps working.

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
