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
- [x] **RED:** Added `app/src/types/scenarios.test.ts` (app, tsconfig includes the src tree so the
      assert is load-bearing under `npm run build`) with the bidirectional `Eq<>`/`Assert<>` helpers
      and `type _assertExtract = Assert<Eq<ExtractedFieldValue, SharedExtractedFieldValue>>`. For the
      MIDDLEWARE side the assert lives in the PRODUCTION file `middleware/src/scenarios/types.ts`
      (not a `.test.ts`) because middleware `tsconfig.json` EXCLUDES `src/**/*.test.ts` from tsc — an
      assert in a middleware test would be dormant. Proved load-bearing on BOTH sides: forking the
      app re-export → `src/types/scenarios.test.ts(21,30): error TS2344: Type 'false' does not
      satisfy the constraint 'true'`; forking the middleware export → `src/scenarios/types.ts(92,45):
      error TS2344: Type 'false' does not satisfy the constraint 'true'`. Reverted, both green.
- [x] **GREEN:** Both `ExtractedFieldValue` sides resolve to the shared type (app re-exports
      `@groundx/shared`; middleware now `export type ExtractedFieldValue = SharedExtractedFieldValue`,
      a behavior-identical alias of the prior `export type { ExtractedFieldValue }` re-export). Asserts
      evaluate `true`; app + middleware tsc pass. No rendered-value change. No local re-fork found.
- [x] **Behavior-preserving (Extract):** `generatedResult.test` (11) green; full app suite (1482) and
      middleware suite (694) green; no rendered-value change.
- [x] **Adversarial review (Eq<> drift guard):** Prove the guard is load-bearing, not dormant.
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
      DONE: forked app re-export (→ TS2344 at the assert) and middleware export (→ TS2344 at the
      assert), reverted, both green. Grep confirms no rival free-standing `ExtractedFieldValue`
      interface/type survives (only the shared canonical decl + re-imports). `Eq<>` helpers are the
      bidirectional `[A] extends [B] ? ([B] extends [A] ? true : false) : false` (not one-directional);
      neither assert is a self-comparison tautology (each pins a module-local symbol vs a separately
      aliased `@groundx/shared` import). The middleware assert sits in a tsc-INCLUDED production file
      so it is enforced (a test-file assert would be excluded → dormant).

## Single-source the Report wire section `[D]`
- [x] **RED (middleware):** Added a structural `Eq<>` assert. Chose the STRONGER derivation-in-place
      design over a separate-test assert: `RenderedSectionWire` is now
      `Pick<RenderedSection, "body"|"confidence"|"warnings"> & { name; render_as; cites:
      RenderedSection["citations"] }`, and a `_assertRenderedSectionWire = Assert<Eq<WireGeneratedCore,
      SharedGeneratedCore>>` lives IN `reportRenderer.ts` (production file — middleware tsc excludes
      tests). Proved RED by forking `WireGeneratedCore.citations` to `string[]` →
      `src/services/reportRenderer.ts(226,42): error TS2344: Type 'false' does not satisfy the
      constraint 'true'`. Reverted, green.
- [x] **GREEN (middleware):** `RenderedSectionWire` derives body/confidence/warnings from the shared
      `RenderedSection` and `cites` from `RenderedSection["citations"]`; assert passes. Behavior-
      preserving: emitted wire JSON across all four fixture templates (ic-brief, unbound-variable
      bound + unbound, no-source) is BYTE-IDENTICAL to a pre-change baseline (`diff` clean).
- [x] **RED (app):** Added the same structural `Eq<>` assert in `app/src/api/smartReport.test.ts`
      (app tsc includes the src tree → load-bearing under `npm run build`), importing the now-exported
      `RenderedSectionWire`. Proved RED by forking the app wire `body` to `number` →
      `src/api/smartReport.test.ts(40,42): error TS2344: Type 'false' does not satisfy the constraint
      'true'`. Reverted, green.
- [x] **GREEN (app):** App `RenderedSectionWire` re-derived from the shared core the same way;
      `wireSectionToRendered` (now `smartReport.ts:98`) keeps mapping `cites`→`citations`/`body`→`body`/
      `name`→`sectionId` unchanged.
- [x] **Behavior-preserving (Report):** `app/src/api/smartReport.test.ts` + all 10 SmartReport-related
      app suites (122 tests) + middleware `reportRenderer.test` (18) green; rendered sections, CiteChips,
      confidence/warnings, em-dash degrade unchanged.
- [x] **Adversarial review (RenderedSectionWire single-source):** Prove the fork is gone, not
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
      DONE: grep confirms BOTH `RenderedSectionWire` decls now `Pick<RenderedSection,...>`-derive from
      the shared core — no free-standing interface listing `body`/`cites`/`confidence`/`warnings`
      survives; only `name`/`render_as`/`cites` are layered on top. Byte-identical proven by diffing
      live-rendered wire JSON vs a pre-change baseline (clean). `wireSectionToRendered` unchanged.
      The wire DERIVES from `RenderedSection`, so a shared-core drift propagates into the wire by
      construction (no divergence possible to catch); the assert instead catches a wire RE-FORK,
      proven RED above. Neither colocated assert is a tautology. No other in-flight change references
      `RenderedSection`/`RenderedSectionWire` on these files (grep of `openspec/changes`, excl. this
      change + archive).

## Closeout
- [x] `openspec validate 2026-05-31-generated-result-shared --strict` → "Change … is valid".
- [x] App test suite green — 178 files / 1482 tests (incl. the two new `Eq<>` asserts compiling
      under `npm run build`).
- [x] Middleware test suite green (file-serial vitest) — 38 files / 694 tests, incl.
      `generatedResult.test` (11) + `reportRenderer.test` (18); the wire + Extract asserts are pinned
      in production files (`reportRenderer.ts`, `scenarios/types.ts`) and enforced by `tsc --noEmit`.
- [x] `npm run build` clean (app: tsc + vite build OK; middleware `tsc --noEmit` exit 0). The
      `Eq<>`/`Assert` guards are load-bearing under tsc (a re-fork on either side fails the build —
      proven RED, then reverted). No `components/`/`views/` `.tsx` touched → style drift guard N/A.
- [ ] Mark `2026-05-29-core-data-model-hardening` item #2 truly done — NOT DONE BY THIS AGENT:
      hard scope rules forbid modifying any OTHER (non-archived) change dir; the umbrella is live at
      `openspec/changes/2026-05-29-core-data-model-hardening/`. The drift guard + Report-wire
      single-source landed under THIS change; the orchestrator should update the umbrella line.
- [ ] Archive `2026-05-31-generated-result-shared` — NOT DONE: hard scope rules forbid
      `openspec archive`; the orchestrator archives later.
