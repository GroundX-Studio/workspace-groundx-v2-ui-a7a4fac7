# Tasks — session/auth + rehydration sub-shapes (illegal-states, leftover of core-data-followups #20)

> The session-auth `AnonSession | AuthedSession` union is DONE upstream (core-data-followups
> step 2-7g) — do NOT re-touch `middleware/src/middleware/session.ts`. This change closes the three
> remaining flat-record sub-shapes. TDD: failing test first (constructing the illegal/old flat shape
> the new union/validator rejects), then implement, then adversarial review before marking done.
> **Adversarial review gate after EVERY task (Discipline §10)** — a task is not `[x]` until an
> adversarial review of its output against the plan AND the real code passes, run before marking done
> and before the next task. WIP cap = 3. Behavior-preserving for every valid input.

## 1. `LoginReqCallback` → discriminated union

- [x] **Failing-first test.** In `app/src/contexts/AuthContext/AuthProvider.test.tsx` (or a new
  `AuthContext.types.test.ts`), assert the new union shape: a `login()` success result narrows on
  `kind === "success"`; a thrown-error result narrows on `kind === "error"` and exposes `error`; the
  banned + no-response branches narrow on their own `kind`. Include a `@ts-expect-error` (or type-level)
  assertion that the OLD flat record `{ isLoggedIn: true, error: true, banned: false }` is NOT assignable
  to the new union (illegal combination unrepresentable). RED before the union exists.
- [x] **Implement the union.** In `AuthContext.tsx` replace `interface LoginReqCallback` with a
  discriminated union whose variant set is derived from `AuthProvider.login`'s real branches
  (`{kind:"success"}` · `{kind:"error";error:unknown}` · `{kind:"banned"}` · `{kind:"failed"}` —
  collapse only the branches the producer actually emits; do NOT invent variants the code never
  returns). Keep the type exported.
- [x] **Migrate the producer + consumers.** Update `AuthProvider.login` to return the union variants
  (1:1 with the old boolean tuples). Update every `login(...)` consumer to narrow on `kind` instead of
  reading `.isLoggedIn`/`.error`/`.banned`. tsc clean; no consumer left reading a removed boolean field.
- [x] **Adversarial review.** Falsify against code: every old return tuple maps to exactly one variant
  (no dropped branch, no behavior change at any call site); the `@ts-expect-error` is real (removing the
  union makes it compile); the failing test was RED before. App build (tsc+vite) clean.

## 2. `SchemaFieldExtractionResult` → discriminated union

- [x] **Failing-first test.** In `app/src/contexts/ChatStoreContext/` (a `types.test.ts` or alongside
  the existing ChatStore tests), assert the new variant union: a `"pending"` result has no `value`
  field; a `"done"` result exposes `value`/`confidence`/`citation`; an `"error"` result narrows to its
  own arm. Include a type-level assertion that the OLD flat shape — e.g. `{ status: "pending", value: 42 }`
  or `{ status: "error", confidence: 0.9 }` — is NOT assignable (success-only fields cannot ride a
  non-done arm). RED before the union exists.
  (Lives in `SchemaFieldExtractionResult.union.test.ts`; the type lives in `@groundx/shared` —
  single-sourced there since `chat-wire-types-shared` — so the union landed in `shared/src/index.ts`
  and `ChatStoreContext/types.ts` re-exports it unchanged.)
- [x] **Implement the union.** In `ChatStoreContext/types.ts` replace `interface SchemaFieldExtractionResult`
  with `{ status: "pending" } | { status: "done"; value: string|number|boolean|null; confidence?: number;
  previousConfidence?: number; citation?: {...}|null } | { status: "error"; message?: string }`. The
  `value`/`confidence`/`previousConfidence`/`citation` fields live ONLY on the `"done"` arm.
  (Implemented as a Zod `discriminatedUnion("status", …)` with each arm `.strict()` in
  `shared/src/index.ts`; the app type is `z.infer<>` of it, re-exported through `types.ts`.)
- [x] **Migrate the producer + consumers.** Update `ChatStoreContext.setSchemaFieldExtraction` (the
  producer, ~line 1684) and the SchemaView consumers (`SchemaView.tsx` — `extractionsById` map, the
  per-field render branches) to narrow on `status` before reading `value`/`confidence`/`citation`.
  Existing `"done"` records keep their exact field set. tsc clean.
  (Also migrated `ProposeSchemaFieldCard.tsx` — the second producer — and dropped the illegal `value:
  null` from its pending/error constructions.)
- [x] **Adversarial review.** Falsify against code: every site that reads `.value`/`.confidence`/
  `.citation` now narrows to `"done"` first (no unguarded access); a `"done"` result is field-for-field
  what the old flat `"done"` record was (behavior-preserving); the type-level reject test is real and was
  RED before. App build clean.

## 3. `parseChatStoreSnapshot(unknown)` validator at the localStorage boundary

- [x] **Failing-first test.** In `app/src/contexts/ChatStoreContext/ChatStoreContext.test.tsx` (or a
  focused `parseChatStoreSnapshot.test.ts`), assert: a VALID current-version snapshot parses to the
  expected `SerializedSnapshot`; a CORRUPT snapshot (e.g. `{ version: 1, sessions: "not-an-array" }`,
  or a session missing `id`, or a non-object) returns `null` and is NOT trusted; a wrong-`version`
  snapshot returns `null`. RED before `parseChatStoreSnapshot` exists.
  (Lives in `parseChatStoreSnapshot.test.ts` — 7 cases incl. wrong-version, non-array sessions,
  missing-id session, non-object, malformed entity tuple.)
- [x] **Implement the validator.** Add `parseChatStoreSnapshot(input: unknown): SerializedSnapshot | null`
  backed by a Zod schema mirroring `SerializedSnapshot`/`SerializedSession`/`SerializedEntitySession`
  (validate `version === STORAGE_VERSION`, `sessions` array shape, entity tuples). Return `null` on any
  parse failure (no throw past the boundary).
  (New module `parseChatStoreSnapshot.ts` — single-sources `STORAGE_VERSION` + the `Serialized*` types
  via `z.infer<>`; `ChatStoreContext.tsx` imports them, its local interfaces removed. `messages.citations`
  reuses the shared `citationSchema` so the validated type IS `Citation[]`.)
- [x] **Wire it into `deserialize`.** Replace `const parsed = JSON.parse(raw) as SerializedSnapshot`
  with a `JSON.parse` + `parseChatStoreSnapshot(...)` call; on `null`, `deserialize` returns `null`
  (rehydrate then falls back to legacy migration / fresh store, exactly as the old `try/catch` path did
  for a throw). A valid snapshot deserializes to the identical state it does today.
- [x] **Adversarial review.** Falsify against code: a valid v1 snapshot round-trips to the same
  in-memory state (behavior-preserving — the existing pre-seed-rehydrate test in
  `ChatStoreContext.test.tsx` still green); a corrupt blob that previously cast-through now returns
  `null` (the only `as SerializedSnapshot` left is the documented string→branded-EntityKey re-brand
  INSIDE the validator, never on untrusted input); the corrupt case was RED before the validator
  (module didn't exist). App build clean.

## Closeout

- [x] `openspec validate 2026-05-31-session-auth-subshapes --strict` passes.
- [x] Full app suite green (1495 tests / 181 files); app build (tsc+vite) clean; drift guards green
  (no-hardcoded-styles, widget-contract run as part of the suite). The `SchemaFieldExtractionResult`
  `Eq<>` contract guard proven load-bearing — forking the shared type to a divergent shape drove tsc
  RED across the consumers + the contract test, then reverted clean. Middleware suite green (694
  tests) + middleware tsc clean.
- [x] No `as SerializedSnapshot` cast of untrusted input and no flat-record `LoginReqCallback`/
  `SchemaFieldExtractionResult` producer remain (grep clean — the lone `as SerializedSnapshot` is the
  documented string→branded-`EntityKey` re-brand inside the validator; the only flat-`LoginReqCallback`
  literals are the `@ts-expect-error` reject asserts). Adversarial review passed PER shape against plan
  AND real code before marking each done.
- [ ] Archive the change (`openspec archive 2026-05-31-session-auth-subshapes`) once merged.
  (NOT done by this agent — archive is the orchestrator's step; out of scope here.)
