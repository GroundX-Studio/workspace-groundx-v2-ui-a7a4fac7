# Data-model tail — close the umbrella's residual loose-typing/SDK debts

## Why

The umbrella `2026-05-29-core-data-model-hardening` was reconciled: everything
delivered except a tail of 6 genuinely-open items. The bulk was shipped by
`core-data-followups` and the Phase-3 folds (both now archived); the canonical
middleware-side `XrayDoc` shipped via `wf05b-word-level-geometry` (archived);
the shared `canvasIntentSchema` shipped via `canvas-intent-schema-shared`
(archived). What remains is a focused set of real, still-present loose-typing /
hand-mirrored-shape / SDK-boundary debts in shipped code. This change is the
tracked home for those 6 items so the umbrella can retire.

These are not aspirational — each is grounded against shipped code:

1. `app/src/components/viewer-widgets/Extract/Extract.tsx:233` —
   `workflowToSchema(wf.workflow as unknown as Record<string, unknown>)`: a
   double-cast at the GroundX-workflow boundary feeding the live-extract schema
   transform.
2. `middleware/src/services/ragPipeline.ts:101` —
   `request.activeStepKind as ViewerStepKind | undefined`: an unvalidated wire
   cast. The in-code comment (lines 88-93) documents that the naive
   `safeParse → undefined` fix WIDENS the tool surface, because
   `toolsForStep(undefined)` returns the FULL catalog while a present-but-invalid
   kind would fall through the filter to the unrestricted-only set. The real fix
   is BLOCKED on first giving `toolsForStep` "unknown step → safe minimum"
   semantics (`middleware/src/services/toolCatalog.ts:725`).
3. `app/src/types/scenarios.ts` ↔ `middleware/src/scenarios/types.ts` —
   `ScenarioConfig` / `ScenarioDocument` / `ScenarioManifest` / `SampleDocFilter`
   are hand-mirrored across the two files with NO drift test; both file headers
   still name `core-data-model-hardening` as the tracked owner and warn the
   runtime "degrades silently" on drift.
4. `app/src/api/entities/groundxDocumentsEntity.ts:41-77` —
   `XrayBoundingBox` / `XrayChunk` / `XrayDocumentPage` / `DocumentXrayResponse`
   are an independent app-side X-Ray type set, distinct from the canonical
   middleware `XrayDoc` (`middleware/src/services/citationGeometry.ts:155`). The
   two sides describe the same `/v1/ingest/document/xray/{id}` payload but share
   no type.
5. `app/src/contexts/DocumentsContext/DocumentsProvider.tsx:110` —
   `(await api.groundxDocuments.getGroundXDocumentXray(...)) as unknown as
   DocumentXrayResponse`: an unguarded double-cast at the legacy-SDK boundary
   (the SDK entity still types the response as `{ xray: Metadata }`).
6. `app/src/api/entities/sdkTypes.ts:69` — `IngestProcess` is 3 fields
   (`processId` / `status` / `message`), dropping the progress / documents the
   status endpoint returns; and `IngestProcessesResponse`
   (`groundxDocumentsEntity.ts:18-20`) carries mutually-exclusive
   `ingests?` / `processes?` keys that are never collapsed. Needs a real-endpoint
   probe to reconcile the shape.

## What Changes

- **Extract workflow cast (item 1):** replace the `as unknown as Record<...>`
  with a typed GroundX-workflow → schema input shape so `workflowToSchema`
  consumes a named type, not a double-cast.
- **ragPipeline activeStepKind (item 2):** GATED on item 2a. First give
  `toolsForStep` an explicit "unknown step → safe minimum" semantics, then
  validate/coerce `request.activeStepKind` (no more bare cast) without widening
  the tool surface for bogus input.
- **Scenario shapes (item 3):** either single-source `ScenarioConfig` /
  `ScenarioDocument` / `ScenarioManifest` / `SampleDocFilter` onto
  `@groundx/shared`, or add a drift test mirroring the `Eq<>` / widget-contract
  precedent. Either way the silent-drift risk is closed and the file headers
  stop naming the retiring umbrella.
- **App X-Ray types (item 4):** promote the app-side X-Ray type set to
  `@groundx/shared` so app + middleware share one X-Ray type family (the
  middleware `XrayDoc` becomes a consumer of the shared set, or both derive from
  it).
- **getDocumentXray cast (item 5):** validate/narrow the SDK-boundary response
  via a runtime parse, or — if the legacy SDK shape makes a clean parse
  impossible — document it as an unavoidable single guarded boundary with a
  runtime check rather than a blind `as unknown as`.
- **IngestProcess shape (item 6):** probe the real `/v1/ingest` +
  `/v1/ingest/{processId}` endpoints, reconcile `IngestProcess` to carry the
  fields the status endpoint actually returns, collapse the mutually-exclusive
  `ingests?` / `processes?` keys, and record the verified shape in
  `docs/agents/groundx-real-api-shapes.md`.
- **Durable spec:** add one `app-architecture` requirement asserting GroundX SDK
  + scenario shapes are validated / single-sourced (no `as unknown as` casts or
  untested hand-mirrored twins).

No behavior change for valid inputs — every item is a typing / single-sourcing /
validation tightening. The only behavior delta is that a malformed value at a
now-guarded boundary coerces/rejects instead of being blind-cast.
