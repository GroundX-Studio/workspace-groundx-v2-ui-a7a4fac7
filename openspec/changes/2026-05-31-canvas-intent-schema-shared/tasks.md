# Tasks — promote a single shared `canvasIntentSchema`

Behavior-preserving for valid intents; the only behavior CHANGE is that a
corrupt/legacy persisted intent now coerces to `null` at both read boundaries
instead of being blind-cast. Each task is failing-test-first (RED before the
schema/guard exists, GREEN after). Adversarial review gate after EVERY task.

## 1. Shared `canvasIntentSchema` (single source of truth)

- [x] **Failing test FIRST (app suite, exercises the shared schema):** add a
      `parseCanvasIntent` block — import `{ parseCanvasIntent, canvasIntentSchema }`
      from `@groundx/shared`. Assert: (a) a well-formed `{ kind: "openDocument",
      documentId: "util-1", page: 2 }` parses and round-trips equal; (b) a
      malformed `{ kind: "openDocument" }` (no `documentId`) → `null`; (c) a
      bogus `{ kind: "notARealKind" }` → `null`; (d) a primitive/array/`{}` →
      `null`. RED first — `parseCanvasIntent` / `canvasIntentSchema` do not yet
      exist. (No standalone shared test runner; shared schemas are covered from
      the app/middleware suites per existing convention.)
- [x] Add `canvasIntentSchema` to `shared/src/index.ts` as a
      `z.discriminatedUnion("kind", [...])` covering EVERY variant currently in
      `contexts/CanvasOrchestratorContext/types.ts` (showSample · openDocument ·
      highlightCitation · jumpToPage · showExtract · editSchema · showIntegrate ·
      showReport · editTemplate · openGate · switchFrame · proposeSchemaField ·
      acceptSchemaField · rejectSchemaField · commitGate · dismissGate ·
      openBookCall · pinToReport · proposeReportSection · acceptReportSection ·
      rejectReportSection · editReportSection · deleteReportSection ·
      submitSignup · wizardNext · wizardBack · wizardFinish · dismissWizard ·
      closeDialog). Reuse existing shared schemas for shared field shapes
      (`normalizedBboxSchema`, `citationTierSchema`, `contentScopeSchema`,
      `templateFieldTypeSchema`). Export `type CanvasIntent = z.infer<typeof
      canvasIntentSchema>` and `parseCanvasIntent(input: unknown): CanvasIntent |
      null` (safe-parse → `null` on failure, mirroring `parseCitations` /
      `parseTemplate`). Build shared (`tsc -p tsconfig.json`). Test goes GREEN.
- [x] **Adversarial review:** diff the new Zod union variant-by-variant against
      the app union — every `kind` present, every required field required, every
      optional field optional, no field renamed. Confirm no rival enum already
      named `canvasIntentSchema` collides with `canvasKindSchema` (the latter is
      the canvas *surface* kind, NOT the intent discriminator — they are distinct
      and BOTH must remain).

## 2. App: derive `CanvasIntent` from the shared schema (no rival union)

- [x] **Failing/guard step:** before editing, confirm the orchestrator
      `dispatch()` switch + `assertNeverIntent` still type-check against the
      shared-derived type (a `tsc --noEmit` that is GREEN before AND after proves
      the type is structurally identical — behavior-preserving). If any field
      drifted in Task 1, `tsc` fails here → fix the schema, not the orchestrator.
- [x] Replace the hand-declared `export type CanvasIntent = | {...} | ...` in
      `contexts/CanvasOrchestratorContext/types.ts` with a re-export of the
      `CanvasIntent` type from `@groundx/shared`. Keep the doc comment pointing at
      the shared schema as the source of truth. `StampedIntent` / `CanvasAdapter`
      / `IntentSource` stay app-side (they are orchestrator-runtime concerns, not
      wire contracts). `npx tsc --noEmit` GREEN across the app.
- [x] **Adversarial review:** grep the app for any remaining local `CanvasIntent`
      declaration or `kind:` literal union that rivals the shared one; confirm the
      orchestrator exhaustiveness test (`dispatchExhaustive.test.ts`) still passes
      and was NOT retargeted.

## 3. App hydration boundary — `coerceHydratedIntent` validates via shared schema

- [x] **Failing test FIRST:** extend `ChatStoreContext/ChatStoreServerHydrator.test.tsx`
      with a case feeding a STRUCTURALLY-corrupt persisted intent that the OLD
      structural guard accepts but the new schema rejects — e.g.
      `currentIntent: { kind: "openDocument" }` (real-looking `kind`, missing
      `documentId`). Assert the hydrated `currentIntent` is `null`. RED first
      (today's guard returns the bogus object via `return raw as CanvasIntent`).
      Keep the existing "well-formed intent hydrates" + "`{}` → null" cases — they
      stay GREEN (behavior preserved for valid + already-rejected inputs).
- [x] Rewrite `coerceHydratedIntent` in `ChatStoreContext.tsx` to delegate to
      `parseCanvasIntent` from `@groundx/shared` (drop the bespoke structural
      check + the cast). Update the docstring (remove "none exists yet" — it now
      exists). The new corrupt-input test goes GREEN; the valid + `{}` cases stay
      GREEN. `npx tsc --noEmit` GREEN.
- [x] **Adversarial review:** open the test file — confirm the RED case is real
      (it FAILS against the pre-change guard) and was not weakened; confirm the
      valid round-trip case asserts equality, not just non-null.

## 4. Middleware row boundary — `rowToChatSession` validates via shared schema

- [x] **Failing test FIRST:** add to `mysqlRepository.test.ts` (or the existing
      row-mapper union-validation block) two cases on `rowToChatSession`: (a) a
      row whose `current_intent_json` is a malformed intent (real `kind`, missing
      required field) → mapped `currentIntent` is `null`, all other fields intact;
      (b) a row with a well-formed intent → `currentIntent` round-trips equal.
      RED first on (a) (today's `as` cast passes the garbage through). Honor the
      file-serial vitest config (no parallelism change).
- [x] In `mysqlRepository.ts` `rowToChatSession`, replace
      `parseJsonColumn(row.current_intent_json) as ChatSessionRecord["currentIntent"]`
      with a `parseCanvasIntent`-validated read (coerce-to-`null` on invalid).
      Adjust the `ChatSessionRecord.currentIntent` type in `middleware/src/types.ts`
      to the shared `CanvasIntent | null` (was `Record<string, unknown> | null`) so
      the middleware also derives from the one schema. The corrupt-input test goes
      GREEN; valid round-trip stays GREEN.
- [x] **Adversarial review:** confirm the WRITE side (`upsertChatSession`
      `JSON.stringify(record.currentIntent)`) still serializes a valid intent
      identically (the schema doesn't strip/rename fields on a valid value);
      confirm `memoryRepository` + any other `ChatSessionRecord` consumer still
      type-check against the narrowed `currentIntent` type. Grep for callers that
      relied on `currentIntent` being an open `Record<string, unknown>`.

## Closeout

- [x] `openspec validate 2026-05-31-canvas-intent-schema-shared --strict` passes.
- [x] App suite green (incl. `ChatStoreServerHydrator.test.tsx`,
      `dispatchExhaustive.test.ts`, the new `parseCanvasIntent` cases) +
      `npx tsc --noEmit` clean. (177 files / 1481 tests pass.)
- [x] Middleware suite green (file-serial) + `npx tsc --noEmit` clean.
      (38 files / 694 tests pass.)
- [x] `npm run build` clean (app + middleware + shared) and drift guards green
      (no-hardcoded-styles 74, widget-contract 164, catalog-parity 10 — unaffected).
- [x] Adversarial review of the WHOLE change against the plan AND the real code:
      one source of truth (no rival `CanvasIntent` union remains — grep for
      `type CanvasIntent =` is empty; the app re-exports the shared type, and a
      drift-fork removing one schema variant turns app `tsc` RED at the dispatch
      switch + `DialogTitle`, then reverted byte-identical); both read boundaries
      validate (app `coerceHydratedIntent` + middleware `rowToChatSession`, plus
      the middleware PATCH write boundary); valid intents behavior-preserved
      (`tsc` green before+after the type swap; round-trip equality at all
      boundaries); the RED tests were genuinely red before. Archive is the
      orchestrator's job (NOT done here per scope rules).
