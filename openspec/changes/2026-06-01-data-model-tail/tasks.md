# Tasks — data-model tail (umbrella residual loose-typing/SDK debts)

> **Per-task adversarial-review gate (locked Discipline §10).** A task is NOT
> done until an adversarial review of its output passes — against THIS plan AND
> the real shipped code, not the seam — run BEFORE marking the task done and
> BEFORE starting the next task. Default gate: falsify every claim against code;
> confirm no no-op / dormant plumbing; open the test file and confirm it is real,
> green, and was NOT retargeted away from the assertion; cross-plan collision
> check on any shared file (`shared/src/index.ts`, `sdkTypes.ts`); run
> `openspec validate 2026-06-01-data-model-tail --strict`; run `npm run build`
> (app + middleware + shared) and the drift guards. A failed gate sends the task
> back to in-progress — never advance.

Every item is failing-test-first (RED before the type/guard exists, GREEN after).
Behavior-preserving for valid inputs; the only behavior CHANGE is that a
malformed value at a now-guarded boundary coerces/rejects instead of being
blind-cast.

## 1. Extract workflow cast — typed workflow→schema input (item 1)

- [x] **Failing test FIRST (app suite):** in `extractLiveData.test.ts` (or a new
      sibling), assert `workflowToSchema` accepts a typed
      `GroundXWorkflowDefinition`-shaped input (NOT `Record<string, unknown>`)
      and returns the expected `ExtractionSchemaDef`; add a `tsc`-level guard
      (or a type-only test) proving the call site no longer needs a double-cast.
      RED first — the named workflow type does not yet exist and `workflowToSchema`
      still takes `Loose`.
- [x] Introduce a named GroundX-workflow → schema input type (the minimal
      `{ extract?: {...} }` shape `workflowToSchema` actually reads,
      `app/src/api/extractLiveData.ts:66`). Update `workflowToSchema`'s parameter
      to that named type (keep the defensive `typeof`/`Array.isArray` guards — the
      payload is still loose at runtime). Remove the
      `wf.workflow as unknown as Record<string, unknown>` double-cast at
      `Extract.tsx:233`; pass the narrowed workflow through. App `tsc --noEmit`
      GREEN; test GREEN.
- [x] **Adversarial review:** confirm the `as unknown as` at `Extract.tsx:233`
      is GONE (grep), not relocated; confirm the new type is not a `Record<string,
      unknown>` alias in disguise; confirm `workflowToSchema`'s runtime defensive
      branches still fire for a malformed workflow (the test covers a missing
      `extract` group → `null`).

## 2a. `toolsForStep` — "unknown step → safe minimum" semantics (item 2 BLOCKER)

> Item 2 is GATED on this task. Per the in-code comment at
> `ragPipeline.ts:88-93`, validating `activeStepKind` naively WIDENS the tool
> surface: `toolsForStep(undefined)` returns the FULL catalog, but a
> present-but-invalid kind currently falls through the step filter to the
> unrestricted-only set. A safe coercion is only possible once `toolsForStep`
> distinguishes "no step (legacy caller) → full" from "unknown/invalid step →
> safe minimum". DO THIS FIRST.

- [x] **Failing test FIRST (middleware suite, file-serial):** in the
      `toolCatalog` test, assert: (a) `toolsForStep(undefined)` returns the full
      catalog (legacy caller — unchanged); (b) a NEW explicit "unknown" signal
      (e.g. a sentinel arg or a separate guard) returns ONLY the safe-minimum
      (unrestricted/no-step) tools, NOT the unrestricted-only fall-through that
      a bogus string yields today; (c) a valid `ViewerStepKind` returns its
      filtered set unchanged. RED first — there is no "unknown → safe minimum"
      path today (`toolCatalog.ts:725`).
- [x] Extend `toolsForStep` (or add a sibling) so an explicitly-unknown step
      resolves to the safe-minimum set, leaving `undefined` (legacy) → full and a
      valid kind → its filter both unchanged. Honor the file-serial vitest config
      (no parallelism change). Tests GREEN.
- [x] **Adversarial review:** confirm the three cases are genuinely distinct in
      the implementation (full vs safe-minimum vs filtered) and the test asserts
      all three; confirm no existing `toolsForStep` caller's behavior changed for
      `undefined` or a valid kind (grep callers).

## 2. ragPipeline activeStepKind — validate, don't bare-cast (item 2)

> GATED on task 2a. Do not start until 2a is done and green.

- [x] **Failing test FIRST (middleware suite, file-serial):** in the ragPipeline
      test, feed a `request.activeStepKind` that is a present-but-invalid string;
      assert the assembled catalog is the SAFE-MINIMUM set (via the 2a path), NOT
      the widened unrestricted-only set and NOT the full catalog. Add/keep a valid-
      kind case asserting the correctly-filtered catalog, and an `undefined` case
      asserting the full catalog. RED first on the invalid-string case (today's
      `as ViewerStepKind` lets it fall through to the wide set).
- [x] Replace `request.activeStepKind as ViewerStepKind | undefined` at
      `ragPipeline.ts:101` with a `viewerStepKindSchema`-validated read
      (`@groundx/shared`) that routes a present-but-invalid kind to the 2a
      "unknown → safe minimum" path, leaves `undefined` → full, and a valid kind
      → its filter. Drop the bare cast. Update the in-code comment (the seam is
      no longer "tracked separately" — it is fixed). Tests GREEN; middleware
      `tsc --noEmit` GREEN.
- [x] **Adversarial review:** confirm the bare `as ViewerStepKind` at
      `ragPipeline.ts:101` is gone; confirm the invalid-input test FAILS against
      the pre-change code (true RED) and was not weakened; confirm the safe-
      minimum result is NOT wider than the legacy unrestricted-only set this
      change was meant to stop widening past.

## 3. Scenario shapes — single-source or drift-test (item 3)

- [x] **Failing test FIRST:** add a drift test asserting `ScenarioConfig` /
      `ScenarioDocument` / `ScenarioManifest` / `SampleDocFilter` agree across
      `app/src/types/scenarios.ts` and `middleware/src/scenarios/types.ts` —
      mirror the `Eq<>` compile-time-equality / widget-contract drift precedent.
      RED first: either the shared types/`Eq<>` assertions do not yet exist, or
      (if going the drift-test route) introduce a deliberate one-field fork to
      prove the test catches drift, then revert. The two file headers
      (`scenarios.ts:1-7`, `middleware/.../types.ts:1-15`) currently only WARN in
      prose with no test.
      DONE: chose (a) single-source. Added scenario Zod schemas + `z.infer` types
      to `@groundx/shared` (`scenarioConfigSchema`/`scenarioManifestSchema`/
      `scenarioDocumentSchema`/`sampleDocFilterSchema` + constituents). New
      `app/src/types/scenarios.drift.test.ts` pins each app re-export to the
      shared type via `Eq<>`; the middleware mirror pin lives in production
      `middleware/src/scenarios/typesDriftGuard.ts` (middleware tsc excludes test
      files). RED first proven: before reconcile, `SampleDocFilter` was
      middleware-only → app drift test failed to compile
      (`TS2305: Module '@/types/scenarios' has no exported member 'SampleDocFilter'`).
- [x] Choose ONE: (a) single-source the four shapes onto `@groundx/shared` and
      re-export from both files (preferred — mirrors the `Citation` precedent
      already in these files); OR (b) keep both files but add the `Eq<>` drift
      test as the enforced guard. Update both file headers to name THIS change and
      point at the single source (or the drift test) — drop the
      `core-data-model-hardening` reference and the "degrades silently" warning.
      App + middleware `tsc --noEmit` GREEN; drift test GREEN.
      DONE: (a) chosen. Both `scenarios.ts` files now pure `export type {...} from
      "@groundx/shared"` re-exports; headers rewritten to name THIS change + the
      new guards and drop the `core-data-model-hardening` reference and the
      "degrades silently" warning. App + middleware `tsc --noEmit` GREEN; drift
      test GREEN.
- [x] **Adversarial review:** if (a), grep that no rival hand-declared
      `ScenarioConfig`/`ScenarioManifest`/`ScenarioDocument`/`SampleDocFilter`
      remains in either file (only re-exports); if (b), confirm the drift test
      genuinely fails on a one-field fork (re-run the fork, confirm RED, revert).
      Confirm no other consumer of these shapes broke (grep importers).
      DONE: grep confirms no `interface Scenario*`/`interface SampleDocFilter`/
      `interface Schema*Def`/`interface ChatSeed`/`interface SampleChatTurn`
      remains in either file (re-exports only). Both guards proven to FIRE on a
      required-field retype fork (`order: number → string`) then reverted — app
      `_assertScenarioConfig` and middleware `typesDriftGuard.ts:57` both went
      `Type 'false' does not satisfy the constraint 'true'`. All importers use the
      barrels (`@/types/scenarios` / `./types.js`) which keep the same names; app
      (183 files/1506 tests) + middleware (38/695) suites GREEN, both builds GREEN.

## 4. App X-Ray types — promote to `@groundx/shared` (item 4)

- [x] **Failing test FIRST:** add a test (app and/or middleware) importing the
      X-Ray type set from `@groundx/shared` and asserting both the app consumer
      (`groundxDocumentsEntity.ts`) and the middleware consumer
      (`citationGeometry.ts` `XrayDoc`) derive from it (e.g. an `Eq<>` assertion
      that the middleware `XrayDoc` is assignable from / structurally agrees with
      the shared set on the fields both read). RED first — the shared X-Ray types
      do not yet exist.
      DONE: new `app/src/api/entities/xrayTypes.drift.test.ts` — `Eq<>` pins each
      app re-export to the canonical `@groundx/shared` type + a runtime fixture
      asserts the shared `documentXrayResponseSchema` validates a representative
      X-Ray payload and rejects a box missing a required corner. RED first proven:
      before promotion the test threw `TypeError: Cannot read properties of
      undefined (reading 'safeParse')` (no shared `documentXrayResponseSchema`)
      and the `Eq<>` asserts had no shared types to import.
- [x] Promote the X-Ray type family (`XrayBoundingBox` / `XrayChunk` /
      `XrayDocumentPage` / `DocumentXrayResponse`, currently
      `groundxDocumentsEntity.ts:41-77`) into `@groundx/shared`. Re-export from
      the app entity; reconcile the middleware `citationGeometry.ts:155` `XrayDoc`
      to consume the shared set (the middleware reads a strict subset — keep its
      optional-field looseness but base it on the shared type). Build shared
      (`tsc -p tsconfig.json`); app + middleware `tsc --noEmit` GREEN.
      DONE: added schema-first canonical X-Ray types to `@groundx/shared`
      (`xrayBoundingBoxSchema`/`xrayChunkSchema`/`xrayDocumentPageSchema`/
      `documentXrayResponseSchema` + `z.infer` types). App entity now
      `export type {...} from "@groundx/shared"` (+ a local `import type` for the
      in-file `getGroundXDocumentXray` annotation, since a type-only re-export
      doesn't bind the name locally under `tsc`). Middleware `XrayDoc`/`XrayChunk`
      DERIVED from the shared canonical via `Pick` + an all-optional relaxation
      (it casts a raw `res.json()` and reads a strict subset); page dims kept
      required (they flow into `PageDim`). Shared rebuilt; app + middleware
      `tsc --noEmit` GREEN.
- [x] **Adversarial review:** confirm there is now ONE X-Ray type source — grep
      both files for independent `interface Xray*` / `interface DocumentXray*`
      declarations and confirm only re-exports / shared-derived types remain;
      confirm `resolveGeometryFromXray` and the `xrayCache` consumer still
      type-check against the reconciled type.
      DONE: grep finds NO `interface Xray*`/`interface DocumentXray*` in app or
      middleware — app is a pure re-export, middleware `XrayDoc` is a shared-derived
      `Pick`/relaxation with an assignability drift guard (`SharedXrayChunk extends
      XrayChunk`, `SharedDocumentXrayResponse extends XrayDoc`) in the production
      module (middleware tsc excludes `*.test.ts`). BOTH guards proven to FIRE then
      reverted: (1) app `Eq<>` — forking the app `XrayChunk` to a local interface
      dropping `suggestedText` → `xrayTypes.drift.test.ts:51 TS2344 Type 'false'
      does not satisfy 'true'`; (2) middleware tie — dropping `text` from the
      canonical `xrayChunkSchema` + rebuilding shared → `citationGeometry.ts`
      `TS2344` on the `Pick` + `TS2345` downstream. `resolveGeometryFromXray`,
      `resolveFieldGeometry`, and `xrayCache.ts` all type-check against the
      reconciled type (middleware `tsc --noEmit` EXIT 0; `xrayCache.test.ts` 5/5
      GREEN). App suite 184/1508 GREEN (+1 file/+2 tests = the new drift test);
      middleware 38/695 GREEN; app build + middleware tsc clean.

## 5. getDocumentXray cast — runtime-narrow the SDK boundary (item 5)

- [x] **Failing test FIRST (app suite):** assert `getDocumentXray` returns a
      value that passes a runtime parse of the X-Ray response shape, and that a
      malformed SDK response is rejected/coerced rather than blind-cast through.
      RED first — today's `as unknown as DocumentXrayResponse`
      (`DocumentsProvider.tsx:110`) passes any shape straight through.
      DONE: added two cases to `DocumentsProvider.test.tsx` under "getDocumentXray
      (item 5 …)" — (a) a valid X-Ray payload round-trips to
      `isSuccess:true`/`response` equal (behavior-preserving); (b) a malformed
      payload (missing `documentPages`/`chunks`/`sourceUrl`) resolves to
      `isSuccess:false` + `error instanceof Error`. RED first proven: against the
      pre-change blind cast the malformed case returned `isSuccess:true`
      (`expected true to be false` at line 132).
- [x] Replace the `as unknown as DocumentXrayResponse` double-cast with a runtime
      parse/narrow against the shared X-Ray schema from task 4 (coerce/reject on
      invalid). If the legacy SDK return type (`{ xray: Metadata }`) genuinely
      precludes a clean parse, instead reduce it to a SINGLE documented guarded
      boundary with a runtime check (not a blind cast) and a comment naming the
      SDK-shape mismatch. App `tsc --noEmit` GREEN; test GREEN.
      DONE: `DocumentsProvider.tsx` now imports `documentXrayResponseSchema` from
      `@groundx/shared` (the canonical schema promoted in item 4) and the
      `getDocumentXray` work fn returns `documentXrayResponseSchema.parse(raw)`. A
      clean parse IS possible (item 4 already retyped the entity wrapper to
      `Promise<DocumentXrayResponse>`, so the residual cast was a leftover no-op
      double-cast, not a `{ xray: Metadata }` mismatch) — no residual boundary
      cast needed. A malformed payload throws inside `run()` → `sdkFailure`. App
      build (incl. `tsc`) clean; test GREEN.
- [x] **Adversarial review:** confirm the `as unknown as` at
      `DocumentsProvider.tsx:110` is gone OR is now a single documented runtime-
      guarded boundary (not a blind cast); confirm the malformed-response test is
      real RED against the pre-change code.
      DONE: grep of `src/contexts/DocumentsContext/` finds NO live
      `as unknown as` — the only surviving occurrences are in explanatory
      comments/test prose; the actual cast (and the now-unused inline
      `DocumentXrayResponse` import) are gone, replaced by a `.parse()`. Malformed
      test proven real RED against pre-change code (see above). Behavior-preserving
      verified: the real consumers' fixtures (`PdfViewerWidget.test.tsx` `fakeXray`,
      `App.test.tsx` xray mock) satisfy the schema and stay GREEN (PdfViewer 23/23,
      App 2/2). App suite 184/1510 GREEN (+2 new tests vs item-4 closeout's 1508);
      middleware 38/695 GREEN; app build + middleware `tsc --noEmit` (EXIT 0) clean;
      `openspec validate 2026-06-01-data-model-tail --strict` valid.

## 6. IngestProcess shape — probe + reconcile (item 6)

> Requires a REAL-ENDPOINT PROBE of `/v1/ingest` (list) and
> `/v1/ingest/{processId}` (status) before fixing the type — the current 3-field
> shape is a guess. Use the GroundX MCP / harness to capture the real payload;
> record the verified shape in `docs/agents/groundx-real-api-shapes.md` (the doc
> exists).

- [x] **Endpoint probe (record findings):** call the real status + list ingest
      endpoints (GroundX MCP `document_getprocessingstatusbyid` /
      `document_getprocesses`, or REST), capture the actual `IngestProcess`
      fields (progress, documents, etc.) and the actual top-level list shape
      (is it `ingests`, `processes`, or both?). Write the verified shapes into
      `docs/agents/groundx-real-api-shapes.md` with the verification date.
      DONE: LIVE probe succeeded 2026-06-01 (partner account, `api.groundx.ai`).
      `document_getprocesses` → top-level key is **`processes`** (NOT `ingests`);
      each list item (`IngestStatusLight`) = `{ id:int, processId:uuid, status }`
      (`statusMessage` absent on complete items → optional).
      `document_getprocessingstatusbyid` → `{ ingest: { processId, status,
      progress: { complete: { total, documents:[…] }, … } } }`; only the non-empty
      bucket was present (each bucket optional); each `documents[]` item is a rich
      GroundXDocument-shaped record (documentId/bucketId/fileName/fileType/
      fileSize/fileTokens/processId/processLevel/sourceUrl/xrayUrl/status/extracted/
      created/updated). Cross-checked against harness `groundx-api`
      `references/02-documents.md` §5–§7 + `12-python-sdk-objects.md` §10 (which add
      `ingest.id` + `statusMessage` + the four empty buckets, each Optional). Recorded
      in `docs/agents/groundx-real-api-shapes.md` (new "ingest processes" section,
      dated 2026-06-01). NOT live-probe-pending — verified.
- [x] **Failing test FIRST (app suite):** assert `IngestProcess` carries the
      probe-verified fields (e.g. progress/documents) and that
      `listGroundXProcesses` returns a single reconciled list (no
      mutually-exclusive `ingests?`/`processes?` ambiguity — the reader collapses
      to one). RED first — `sdkTypes.ts:69` is 3 fields and
      `IngestProcessesResponse` (`groundxDocumentsEntity.ts:18-20`) exposes both
      optional keys.
      DONE: two cases added to `groundxDocumentsEntity.test.ts` — (a) a type-level
      assertion building the heavy live status shape against `IngestProcess` +
      reading `IngestProcessDocument`; (b) a runtime collapse test on
      `listGroundXProcesses` (processes-key / ingests-key / empty → single array).
      RED first proven BOTH ways: `tsc --noEmit` gave 5 errors (TS2305 no
      `IngestProcessDocument`; TS2353 `id` not in `IngestProcess`; TS2339
      `progress`/`statusMessage` missing), and the runtime case failed
      (`expected { processes:[…] } to deeply equal […]`).
- [x] Reconcile `IngestProcess` (`sdkTypes.ts:69`) to the probe-verified shape;
      collapse the `ingests?`/`processes?` keys in `listGroundXProcesses`
      (`groundxDocumentsEntity.ts:273`) to a single normalized array at the reader
      boundary. Update consumers (`DocumentsProvider`/`DocumentsContext`) as
      needed. App `tsc --noEmit` GREEN; test GREEN.
      DONE: `IngestProcess` now `{ processId, status, id?, statusMessage?,
      progress? }` (the unverified-guess `message` REMOVED, replaced by canonical
      `statusMessage`; `status` enum gains `training`). Added `IngestProgress` /
      `IngestProgressBucket` / `IngestProcessDocument` (extends `GroundXDocument`).
      ONE type covers the light submit/poll-list shape and the heavy status shape
      (everything past `processId`/`status` optional). The exported
      `IngestProcessesResponse` is gone — replaced by a file-private
      `RawIngestProcessesResponse`; `listGroundXProcesses` now returns
      `Promise<IngestProcess[]>` via `processes ?? ingests ?? []`.
      `DocumentsProvider.listProcesses` updated to consume the array directly;
      `sdkContexts.test.tsx` mock updated to the array contract. App `tsc --noEmit`
      EXIT 0; tests GREEN.
- [x] **Adversarial review:** confirm the new fields match the recorded probe
      (not invented); confirm the list reader returns one array regardless of
      which key the API used; confirm no consumer still reads `.ingests`/`.processes`
      directly (grep).
      DONE: every field traces to the live probe + harness ref (no invention; old
      guessed `message` dropped). Reader collapses to one array — runtime test
      proves all three branches (processes / ingests / empty). Grep: only
      surviving `.ingests`/wire-`.processes` read is the single reader collapse
      line (`groundxDocumentsEntity.ts:265`); the other `.processes` hit is the
      unrelated DocumentsContext STATE property. No `IngestProcessesResponse`
      survives anywhere (app + middleware). `IngestProcessDocument extends
      GroundXDocument` is assignable past its `[key:string]: unknown` index sig
      (tsc clean). App 184/1512 GREEN; middleware 38/695 GREEN; app build + middleware
      tsc EXIT 0; `openspec validate --strict` valid.

## Closeout

- [ ] `openspec validate 2026-06-01-data-model-tail --strict` passes.
- [ ] App suite green + `npx tsc --noEmit` clean.
- [ ] Middleware suite green (file-serial) + `npx tsc --noEmit` clean.
- [ ] `npm run build` clean (app + middleware + shared) and drift guards green
      (no-hardcoded-styles, widget-contract, catalog-parity, plus any new
      scenario / X-Ray drift guard added here).
- [ ] `docs/agents/groundx-real-api-shapes.md` updated with the item-6 probe
      findings; `docs/agents/data-model.md` reconciliation matrix updated for the
      promoted X-Ray + scenario shapes if it tracks them.
- [ ] Adversarial review of the WHOLE change against the plan AND the real code:
      every cited `as unknown as` removed or converted to a documented runtime
      guard; scenario + X-Ray shapes single-sourced or drift-tested; item-2 fix
      provably does not widen the tool surface; no rival type declarations remain.
- [ ] Retire the umbrella `2026-05-29-core-data-model-hardening` (its 6 residual
      items now live here) and archive THIS change. (Archive is the orchestrator's
      job — do NOT archive as part of execution.)
