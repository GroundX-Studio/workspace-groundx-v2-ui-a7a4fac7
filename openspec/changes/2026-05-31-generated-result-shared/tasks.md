# Tasks — generated-result shared type: drift guard + Report-wire single-source

> TDD: failing test first, then implement, then adversarial review before marking done.
> **Adversarial review gate after EVERY task (Discipline §10)** — a task is not `[x]`
> until an adversarial review of its output against the plan AND the real code passes,
> run before marking done and before the next task.

Scope is the REMAINING gap only. The shared `GeneratedResult` + `ExtractedFieldValue` +
`RenderedSection` + `parseGeneratedResult` + the 11-test runtime parse suite already exist and are
green (`shared/src/index.ts:347-429`, `middleware/src/services/generatedResult.test.ts`). Do NOT
re-author them. Each task is TDD: a failing assert/test FIRST (RED), then the minimal change (GREEN),
then refactor. The `Eq<>` precedent is `app/src/api/chatSessions.test.ts:40-43`.

## Compile-time drift guard — Extract side `[D]`
- [ ] **RED:** In a colocated test (e.g. `app/src/types/scenarios.test.ts` or the existing
      generated-result test), add `type Eq<A,B> = [A] extends [B] ? ([B] extends [A] ? true : false)
      : false; type Assert<T extends true> = T;` and a `type _assertExtract = Assert<Eq<
      ExtractedFieldValue, { fieldId: string; value: GeneratedBody; citations: Citation[];
      confidence?: number; warnings?: string[] }>>` (or `Eq<ExtractedFieldValue, SharedExtractedFieldValue>`
      pinned to the shared type). Prove it is load-bearing: temporarily fork one field locally and
      confirm `tsc`/`npm run build` FAILS (RED), then revert. Capture the failing tsc line.
- [ ] **GREEN:** With the app/middleware `ExtractedFieldValue` re-exporting the shared type
      (already true), the assert evaluates `true` and the build passes. No production code change
      expected on the Extract side beyond confirming the re-export; if any local re-fork is found,
      collapse it onto the shared type.
- [ ] **Behavior-preserving (Extract):** Run the existing Extract suites (`generatedResult.test`,
      `ExtractView`/`Extract`, `SchemaView`) — all green, no rendered-value change.
- [ ] **Adversarial review (Eq<> drift guard):** Prove the guard is load-bearing, not dormant.
      For EACH consumer type pinned by an `Eq<>` assert (app + middleware `ExtractedFieldValue`,
      and any `GeneratedResult`/`RenderedSection` re-export covered), temporarily fork it to a
      single-field mismatch (e.g. rename `fieldId`→`field_id`, drop `citations`, or widen
      `confidence` to `string`) and confirm `npx tsc --noEmit` / `npm run build` FAILS with the
      `Assert<Eq<...>>` line — capture the failing tsc output — then REVERT and confirm green
      again. Falsify the "re-export is the only source" claim: grep app + middleware for any
      remaining free-standing `ExtractedFieldValue`/`GeneratedResult` interface or `type` literal
      that rivals the `@groundx/shared` re-export (no second declaration survives). Confirm the
      `Eq<>`/`Assert<>` helpers were not weakened to `[A] extends [B]` (one-directional) and the
      test file was not retargeted to a trivial pass. Failed gate → back to in-progress.

## Single-source the Report wire section `[D]`
- [ ] **RED (middleware):** Add an `Eq<>`/structural assert in a colocated test that
      `reportRenderer.ts`'s `RenderedSectionWire` generated-result fields (`body`, `cites`,
      `confidence?`, `warnings?`) match the shared `RenderedSection` core — i.e. the wire section IS
      a `RenderedSection` specialization (shared core + the snake_case display metadata
      `name`/`render_as` layered on top, mapping `cites`→`citations`/`body`→`body`/`sectionId`
      derived). The assert is RED while `RenderedSectionWire` is a free-standing interface
      (`middleware/src/services/reportRenderer.ts:196`).
- [ ] **GREEN (middleware):** Re-derive `RenderedSectionWire` from the shared `RenderedSection`
      core (e.g. `RenderedSection`-derived body/citations/confidence/warnings + `{ name, render_as }`
      display layer, with `cites` as the snake_case wire alias for `citations`) so the assert passes.
      Behavior-preserving: the emitted wire JSON keys/values are byte-identical to today.
- [ ] **RED (app):** Same `Eq<>`/structural assert in `app/src/api/smartReport.test.ts` pinning the
      app's local `RenderedSectionWire` (`smartReport.ts:56`) to the shared `RenderedSection` core.
      RED while the app interface is free-standing.
- [ ] **GREEN (app):** Re-derive the app `RenderedSectionWire` from the shared core the same way;
      `wireSectionToRendered` (`smartReport.ts:89`) keeps mapping wire→`RenderedSection` unchanged.
- [ ] **Behavior-preserving (Report):** Run `app/src/api/smartReport.test.ts` + the SmartReport
      render/widget suites + middleware report-render tests — all green; the rendered Report sections
      (markdown body, CiteChips, confidence/warnings, em-dash low-confidence degrade) are unchanged.
- [ ] **Adversarial review (RenderedSectionWire single-source):** Prove the fork is gone, not
      shadowed. Grep BOTH `app/src/api/smartReport.ts` (was `:56`) and
      `middleware/src/services/reportRenderer.ts` (was `:196`) and confirm each `RenderedSectionWire`
      declaration now DERIVES from the shared `RenderedSection` core (`@groundx/shared`) — no
      free-standing interface listing `body`/`cites`/`confidence`/`warnings` survives on either
      side; the only locally-declared members are the snake_case display layer (`name`, `render_as`)
      and the `cites` wire alias. Falsify the "byte-identical" claim against the REAL renderer: run
      the middleware report-render path and diff the emitted wire JSON (keys AND values, snake_case
      `cites`/`render_as` display layer intact) against a pre-change fixture — must be byte-identical;
      confirm `wireSectionToRendered` (`smartReport.ts:89`) still maps `cites`→`citations`/`body`→`body`
      unchanged. Confirm the `Eq<>` assert is RED if the shared core drifts (re-run the fork test on
      a `RenderedSection` field) and that neither colocated test was retargeted to a tautology.
      Cross-plan collision check: confirm no other in-flight change re-forks `RenderedSection`/
      `RenderedSectionWire` on the same files. Failed gate → back to in-progress.

## Closeout
- [ ] `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && openspec validate
      2026-05-31-generated-result-shared --strict` prints valid.
- [ ] App test suite green (`npm test` in `app/`), incl. the two new `Eq<>` asserts compiling.
- [ ] Middleware test suite green (file-serial vitest), incl. the wire assert + `generatedResult.test`.
- [ ] `npm run build` clean from repo root (the `Eq<>`/`Assert` guards are load-bearing under tsc;
      a re-fork on either side now fails the build) + drift guards green.
- [ ] Mark `2026-05-29-core-data-model-hardening` item #2 truly done — update its `tasks.md` line to
      note the drift guard + Report-wire single-source landed under this change (the type itself was
      already there; this closes the enforcement gap).
- [ ] Archive `2026-05-31-generated-result-shared` (`openspec archive` per repo convention).
