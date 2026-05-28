# Proposal envelope provenance

## Why

The spec wireframes (`v2-dashboard/spec-flow.jsx` lines 1190-1207 and
the matching Neil Batch E pattern at `groundx-wireframes/02-mock-sources/neil-katz/batch-e-schemas-stress.html`
line 1992) declare an `envelope verified` provenance label on every
ProposalCard: `proposal_v1 · envelope verified`. The "envelope" is the
Zod-validated structure the LLM emits when proposing a schema mutation;
"envelope verified" tells the user the server's Zod validator accepted
the LLM's structured output. Proposals that fail validation SHALL NOT
surface to the user at all.

The current scaffold parses a loose `proposedSchemaField` field from
the LLM JSON block but doesn't enforce a versioned envelope schema or
expose a provenance label.

## What changes

- DEFINE a versioned Zod schema for the LLM proposal envelope on the
  middleware side: `proposalEnvelopeV1Schema` covering name, type,
  description, categoryId (and a future-proof `version: "v1"` literal).
- VALIDATE the LLM's JSON block against the envelope schema in
  `chatRouter.parseGroundedAnswer`. ON validation failure: drop the
  proposal entirely (do not surface a half-built card to the user).
- ATTACH a `provenance: { version: "v1"; verified: true }` field to the
  parsed proposal that the frontend reads.
- ON the ProposalCard render path, surface the provenance label:
  `proposal_v<version> · envelope verified`.
- ON the F3a ProposalCard variant (inside the Fields tab, as opposed to
  the chat propose-card), include the provenance label inline with the
  PROPOSAL badge.

## Out of scope

- Future `proposal_v2` envelope shapes (e.g. multi-field, edit-field).
  The schema today only covers single-field-add.

## Affected

- Middleware: `scaffold/middleware/src/services/chatRouter.ts` (Zod
  validation + `provenance` field), `chatRouter.test.ts` (validation
  scenarios).
- Scaffold: `chat-widgets/ProposeSchemaFieldCard/`, `SchemaView.tsx`
  ProposalCard render.
- Requirement: `ProposalCard SHALL declare envelope provenance and offer Accept/Dismiss`.
