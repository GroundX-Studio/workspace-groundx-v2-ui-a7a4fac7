# Tasks — proposal-envelope-provenance

## 1. Failing closure-gate tests

- [x] Middleware test: `parseGroundedAnswer` returns `{provenance: {version:"v1", verified:true}}` for a well-formed envelope (with explicit `"version":"v1"`).
- [x] Middleware test: `parseGroundedAnswer` backfills v1 provenance when the envelope omits the version literal (backwards-compat with pre-envelope fixtures).
- [x] Middleware test: `parseGroundedAnswer` returns `proposedSchemaField: null` when categoryId is missing.
- [x] Middleware test: `parseGroundedAnswer` returns `proposedSchemaField: null` when an unsupported version literal (`"v2"`) is sent.
- [x] Frontend test: ProposeSchemaFieldCard renders `proposal_v1 · envelope verified` next to the ADD FIELD badge when `provenance.verified === true`; omits the label when provenance is absent.
- [x] Frontend test: F3a Fields-tab ProposalCard variant renders the same provenance label; omits the label when absent.

## 2. Implementation

- [x] `zod` already present in `scaffold/middleware/package.json` — no install needed.
- [x] Define `proposalEnvelopeV1Schema` in `scaffold/middleware/src/services/chatRouter.ts` covering `{version?: "v1", categoryId, name, type, description}` with `.strict()`.
- [x] Replace the manual `psfCandidate` validation in `parseGroundedAnswer` with `proposalEnvelopeV1Schema.safeParse`. On failure return `proposedSchemaField: null` and log the parse error via `logger.warn`.
- [x] On success attach `provenance: { version: "v1", verified: true }` to the returned `proposedSchemaField`.
- [x] Update `ProposedSchemaField` type (middleware + `scaffold/app/src/api/chatSessions.ts` mirror) to include the optional `provenance` field.
- [x] Update LLM system prompt to instruct the model to include `"version":"v1"` in `proposedSchemaField`.
- [x] Forward `provenance` through `enqueueFieldProposal` in `ChatColumn.tsx` so the canvas surface also receives it.
- [x] Add `provenance?: {version:"v1"; verified:true}` to `SchemaFieldProposal` queue type.
- [x] Render `proposal_v1 · envelope verified` on `ProposeSchemaFieldCard` (chat-widget) — testid `propose-schema-field-provenance`.
- [x] Render `proposal_v1 · envelope verified` on the F3a `ProposalCard` variant in `SchemaView` — testid `schema-proposal-provenance-<id>`.

## 3. Cross-checks

- [x] Dead-context: `provenance` is READ by both render surfaces (chat-widget + F3a Fields tab).
- [x] Dead-endpoint: only `parseGroundedAnswer` emits `ProposedSchemaField`; no other endpoint bypasses the envelope.
- [x] Round-trip: middleware parse → ChatReply → ChatColumn liveTurn + enqueueFieldProposal → both render surfaces — covered by the test set in step 1.

## 4. Verification

- [x] middleware vitest green (408/408 including 4 new + 1 updated provenance assertion).
- [x] app vitest green (882/882 including 4 new chat-widget + F3a render tests).
- [x] tsc green on app side; pre-existing middleware tsc errors unrelated to this change.
- [x] `openspec validate proposal-envelope-provenance --strict` green.
