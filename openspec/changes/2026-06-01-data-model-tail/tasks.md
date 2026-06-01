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

- [ ] **Failing test FIRST (app suite):** in `extractLiveData.test.ts` (or a new
      sibling), assert `workflowToSchema` accepts a typed
      `GroundXWorkflowDefinition`-shaped input (NOT `Record<string, unknown>`)
      and returns the expected `ExtractionSchemaDef`; add a `tsc`-level guard
      (or a type-only test) proving the call site no longer needs a double-cast.
      RED first — the named workflow type does not yet exist and `workflowToSchema`
      still takes `Loose`.
- [ ] Introduce a named GroundX-workflow → schema input type (the minimal
      `{ extract?: {...} }` shape `workflowToSchema` actually reads,
      `app/src/api/extractLiveData.ts:66`). Update `workflowToSchema`'s parameter
      to that named type (keep the defensive `typeof`/`Array.isArray` guards — the
      payload is still loose at runtime). Remove the
      `wf.workflow as unknown as Record<string, unknown>` double-cast at
      `Extract.tsx:233`; pass the narrowed workflow through. App `tsc --noEmit`
      GREEN; test GREEN.
- [ ] **Adversarial review:** confirm the `as unknown as` at `Extract.tsx:233`
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

- [ ] **Failing test FIRST (middleware suite, file-serial):** in the
      `toolCatalog` test, assert: (a) `toolsForStep(undefined)` returns the full
      catalog (legacy caller — unchanged); (b) a NEW explicit "unknown" signal
      (e.g. a sentinel arg or a separate guard) returns ONLY the safe-minimum
      (unrestricted/no-step) tools, NOT the unrestricted-only fall-through that
      a bogus string yields today; (c) a valid `ViewerStepKind` returns its
      filtered set unchanged. RED first — there is no "unknown → safe minimum"
      path today (`toolCatalog.ts:725`).
- [ ] Extend `toolsForStep` (or add a sibling) so an explicitly-unknown step
      resolves to the safe-minimum set, leaving `undefined` (legacy) → full and a
      valid kind → its filter both unchanged. Honor the file-serial vitest config
      (no parallelism change). Tests GREEN.
- [ ] **Adversarial review:** confirm the three cases are genuinely distinct in
      the implementation (full vs safe-minimum vs filtered) and the test asserts
      all three; confirm no existing `toolsForStep` caller's behavior changed for
      `undefined` or a valid kind (grep callers).

## 2. ragPipeline activeStepKind — validate, don't bare-cast (item 2)

> GATED on task 2a. Do not start until 2a is done and green.

- [ ] **Failing test FIRST (middleware suite, file-serial):** in the ragPipeline
      test, feed a `request.activeStepKind` that is a present-but-invalid string;
      assert the assembled catalog is the SAFE-MINIMUM set (via the 2a path), NOT
      the widened unrestricted-only set and NOT the full catalog. Add/keep a valid-
      kind case asserting the correctly-filtered catalog, and an `undefined` case
      asserting the full catalog. RED first on the invalid-string case (today's
      `as ViewerStepKind` lets it fall through to the wide set).
- [ ] Replace `request.activeStepKind as ViewerStepKind | undefined` at
      `ragPipeline.ts:101` with a `viewerStepKindSchema`-validated read
      (`@groundx/shared`) that routes a present-but-invalid kind to the 2a
      "unknown → safe minimum" path, leaves `undefined` → full, and a valid kind
      → its filter. Drop the bare cast. Update the in-code comment (the seam is
      no longer "tracked separately" — it is fixed). Tests GREEN; middleware
      `tsc --noEmit` GREEN.
- [ ] **Adversarial review:** confirm the bare `as ViewerStepKind` at
      `ragPipeline.ts:101` is gone; confirm the invalid-input test FAILS against
      the pre-change code (true RED) and was not weakened; confirm the safe-
      minimum result is NOT wider than the legacy unrestricted-only set this
      change was meant to stop widening past.

## 3. Scenario shapes — single-source or drift-test (item 3)

- [ ] **Failing test FIRST:** add a drift test asserting `ScenarioConfig` /
      `ScenarioDocument` / `ScenarioManifest` / `SampleDocFilter` agree across
      `app/src/types/scenarios.ts` and `middleware/src/scenarios/types.ts` —
      mirror the `Eq<>` compile-time-equality / widget-contract drift precedent.
      RED first: either the shared types/`Eq<>` assertions do not yet exist, or
      (if going the drift-test route) introduce a deliberate one-field fork to
      prove the test catches drift, then revert. The two file headers
      (`scenarios.ts:1-7`, `middleware/.../types.ts:1-15`) currently only WARN in
      prose with no test.
- [ ] Choose ONE: (a) single-source the four shapes onto `@groundx/shared` and
      re-export from both files (preferred — mirrors the `Citation` precedent
      already in these files); OR (b) keep both files but add the `Eq<>` drift
      test as the enforced guard. Update both file headers to name THIS change and
      point at the single source (or the drift test) — drop the
      `core-data-model-hardening` reference and the "degrades silently" warning.
      App + middleware `tsc --noEmit` GREEN; drift test GREEN.
- [ ] **Adversarial review:** if (a), grep that no rival hand-declared
      `ScenarioConfig`/`ScenarioManifest`/`ScenarioDocument`/`SampleDocFilter`
      remains in either file (only re-exports); if (b), confirm the drift test
      genuinely fails on a one-field fork (re-run the fork, confirm RED, revert).
      Confirm no other consumer of these shapes broke (grep importers).

## 4. App X-Ray types — promote to `@groundx/shared` (item 4)

- [ ] **Failing test FIRST:** add a test (app and/or middleware) importing the
      X-Ray type set from `@groundx/shared` and asserting both the app consumer
      (`groundxDocumentsEntity.ts`) and the middleware consumer
      (`citationGeometry.ts` `XrayDoc`) derive from it (e.g. an `Eq<>` assertion
      that the middleware `XrayDoc` is assignable from / structurally agrees with
      the shared set on the fields both read). RED first — the shared X-Ray types
      do not yet exist.
- [ ] Promote the X-Ray type family (`XrayBoundingBox` / `XrayChunk` /
      `XrayDocumentPage` / `DocumentXrayResponse`, currently
      `groundxDocumentsEntity.ts:41-77`) into `@groundx/shared`. Re-export from
      the app entity; reconcile the middleware `citationGeometry.ts:155` `XrayDoc`
      to consume the shared set (the middleware reads a strict subset — keep its
      optional-field looseness but base it on the shared type). Build shared
      (`tsc -p tsconfig.json`); app + middleware `tsc --noEmit` GREEN.
- [ ] **Adversarial review:** confirm there is now ONE X-Ray type source — grep
      both files for independent `interface Xray*` / `interface DocumentXray*`
      declarations and confirm only re-exports / shared-derived types remain;
      confirm `resolveGeometryFromXray` and the `xrayCache` consumer still
      type-check against the reconciled type.

## 5. getDocumentXray cast — runtime-narrow the SDK boundary (item 5)

- [ ] **Failing test FIRST (app suite):** assert `getDocumentXray` returns a
      value that passes a runtime parse of the X-Ray response shape, and that a
      malformed SDK response is rejected/coerced rather than blind-cast through.
      RED first — today's `as unknown as DocumentXrayResponse`
      (`DocumentsProvider.tsx:110`) passes any shape straight through.
- [ ] Replace the `as unknown as DocumentXrayResponse` double-cast with a runtime
      parse/narrow against the shared X-Ray schema from task 4 (coerce/reject on
      invalid). If the legacy SDK return type (`{ xray: Metadata }`) genuinely
      precludes a clean parse, instead reduce it to a SINGLE documented guarded
      boundary with a runtime check (not a blind cast) and a comment naming the
      SDK-shape mismatch. App `tsc --noEmit` GREEN; test GREEN.
- [ ] **Adversarial review:** confirm the `as unknown as` at
      `DocumentsProvider.tsx:110` is gone OR is now a single documented runtime-
      guarded boundary (not a blind cast); confirm the malformed-response test is
      real RED against the pre-change code.

## 6. IngestProcess shape — probe + reconcile (item 6)

> Requires a REAL-ENDPOINT PROBE of `/v1/ingest` (list) and
> `/v1/ingest/{processId}` (status) before fixing the type — the current 3-field
> shape is a guess. Use the GroundX MCP / harness to capture the real payload;
> record the verified shape in `docs/agents/groundx-real-api-shapes.md` (the doc
> exists).

- [ ] **Endpoint probe (record findings):** call the real status + list ingest
      endpoints (GroundX MCP `document_getprocessingstatusbyid` /
      `document_getprocesses`, or REST), capture the actual `IngestProcess`
      fields (progress, documents, etc.) and the actual top-level list shape
      (is it `ingests`, `processes`, or both?). Write the verified shapes into
      `docs/agents/groundx-real-api-shapes.md` with the verification date.
- [ ] **Failing test FIRST (app suite):** assert `IngestProcess` carries the
      probe-verified fields (e.g. progress/documents) and that
      `listGroundXProcesses` returns a single reconciled list (no
      mutually-exclusive `ingests?`/`processes?` ambiguity — the reader collapses
      to one). RED first — `sdkTypes.ts:69` is 3 fields and
      `IngestProcessesResponse` (`groundxDocumentsEntity.ts:18-20`) exposes both
      optional keys.
- [ ] Reconcile `IngestProcess` (`sdkTypes.ts:69`) to the probe-verified shape;
      collapse the `ingests?`/`processes?` keys in `listGroundXProcesses`
      (`groundxDocumentsEntity.ts:273`) to a single normalized array at the reader
      boundary. Update consumers (`DocumentsProvider`/`DocumentsContext`) as
      needed. App `tsc --noEmit` GREEN; test GREEN.
- [ ] **Adversarial review:** confirm the new fields match the recorded probe
      (not invented); confirm the list reader returns one array regardless of
      which key the API used; confirm no consumer still reads `.ingests`/`.processes`
      directly (grep).

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
