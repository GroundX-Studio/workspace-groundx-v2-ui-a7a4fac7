# Tasks — session/auth + rehydration sub-shapes (illegal-states, leftover of core-data-followups #20)

> The session-auth `AnonSession | AuthedSession` union is DONE upstream (core-data-followups
> step 2-7g) — do NOT re-touch `middleware/src/middleware/session.ts`. This change closes the three
> remaining flat-record sub-shapes. TDD: failing test first (constructing the illegal/old flat shape
> the new union/validator rejects), then implement, then adversarial review before marking done.
> WIP cap = 3. Behavior-preserving for every valid input.

## 1. `LoginReqCallback` → discriminated union

- [ ] **Failing-first test.** In `app/src/contexts/AuthContext/AuthProvider.test.tsx` (or a new
  `AuthContext.types.test.ts`), assert the new union shape: a `login()` success result narrows on
  `kind === "success"`; a thrown-error result narrows on `kind === "error"` and exposes `error`; the
  banned + no-response branches narrow on their own `kind`. Include a `@ts-expect-error` (or type-level)
  assertion that the OLD flat record `{ isLoggedIn: true, error: true, banned: false }` is NOT assignable
  to the new union (illegal combination unrepresentable). RED before the union exists.
- [ ] **Implement the union.** In `AuthContext.tsx` replace `interface LoginReqCallback` with a
  discriminated union whose variant set is derived from `AuthProvider.login`'s real branches
  (`{kind:"success"}` · `{kind:"error";error:unknown}` · `{kind:"banned"}` · `{kind:"failed"}` —
  collapse only the branches the producer actually emits; do NOT invent variants the code never
  returns). Keep the type exported.
- [ ] **Migrate the producer + consumers.** Update `AuthProvider.login` to return the union variants
  (1:1 with the old boolean tuples). Update every `login(...)` consumer to narrow on `kind` instead of
  reading `.isLoggedIn`/`.error`/`.banned`. tsc clean; no consumer left reading a removed boolean field.
- [ ] **Adversarial review.** Falsify against code: every old return tuple maps to exactly one variant
  (no dropped branch, no behavior change at any call site); the `@ts-expect-error` is real (removing the
  union makes it compile); the failing test was RED before. App build (tsc+vite) clean.

## 2. `SchemaFieldExtractionResult` → discriminated union

- [ ] **Failing-first test.** In `app/src/contexts/ChatStoreContext/` (a `types.test.ts` or alongside
  the existing ChatStore tests), assert the new variant union: a `"pending"` result has no `value`
  field; a `"done"` result exposes `value`/`confidence`/`citation`; an `"error"` result narrows to its
  own arm. Include a type-level assertion that the OLD flat shape — e.g. `{ status: "pending", value: 42 }`
  or `{ status: "error", confidence: 0.9 }` — is NOT assignable (success-only fields cannot ride a
  non-done arm). RED before the union exists.
- [ ] **Implement the union.** In `ChatStoreContext/types.ts` replace `interface SchemaFieldExtractionResult`
  with `{ status: "pending" } | { status: "done"; value: string|number|boolean|null; confidence?: number;
  previousConfidence?: number; citation?: {...}|null } | { status: "error"; message?: string }`. The
  `value`/`confidence`/`previousConfidence`/`citation` fields live ONLY on the `"done"` arm.
- [ ] **Migrate the producer + consumers.** Update `ChatStoreContext.setSchemaFieldExtraction` (the
  producer, ~line 1684) and the SchemaView consumers (`SchemaView.tsx` — `extractionsById` map, the
  per-field render branches) to narrow on `status` before reading `value`/`confidence`/`citation`.
  Existing `"done"` records keep their exact field set. tsc clean.
- [ ] **Adversarial review.** Falsify against code: every site that reads `.value`/`.confidence`/
  `.citation` now narrows to `"done"` first (no unguarded access); a `"done"` result is field-for-field
  what the old flat `"done"` record was (behavior-preserving); the type-level reject test is real and was
  RED before. App build clean.

## 3. `parseChatStoreSnapshot(unknown)` validator at the localStorage boundary

- [ ] **Failing-first test.** In `app/src/contexts/ChatStoreContext/ChatStoreContext.test.tsx` (or a
  focused `parseChatStoreSnapshot.test.ts`), assert: a VALID current-version snapshot parses to the
  expected `SerializedSnapshot`; a CORRUPT snapshot (e.g. `{ version: 1, sessions: "not-an-array" }`,
  or a session missing `id`, or a non-object) returns `null` and is NOT trusted; a wrong-`version`
  snapshot returns `null`. RED before `parseChatStoreSnapshot` exists.
- [ ] **Implement the validator.** Add `parseChatStoreSnapshot(input: unknown): SerializedSnapshot | null`
  backed by a Zod schema mirroring `SerializedSnapshot`/`SerializedSession`/`SerializedEntitySession`
  (validate `version === STORAGE_VERSION`, `sessions` array shape, entity tuples). Return `null` on any
  parse failure (no throw past the boundary).
- [ ] **Wire it into `deserialize`.** Replace `const parsed = JSON.parse(raw) as SerializedSnapshot`
  with a `JSON.parse` + `parseChatStoreSnapshot(...)` call; on `null`, `deserialize` returns `null`
  (rehydrate then falls back to legacy migration / fresh store, exactly as the old `try/catch` path did
  for a throw). A valid snapshot deserializes to the identical state it does today.
- [ ] **Adversarial review.** Falsify against code: a valid v1 snapshot round-trips to the same
  in-memory state (behavior-preserving — diff the resulting `ChatStoreState`); a corrupt blob that
  previously cast-through now returns `null` (the cast is gone — grep for any remaining
  `as SerializedSnapshot`); the test's corrupt case was RED before the validator (cast-through would have
  produced a malformed state, not `null`). App build clean.

## Closeout

- [ ] `openspec validate 2026-05-31-session-auth-subshapes --strict` passes.
- [ ] Full app suite green; app build (tsc+vite) clean; drift guards green (no-hardcoded-styles,
  widget-contract, any `as <WireType>`-cast guard).
- [ ] No `as SerializedSnapshot` cast and no flat-record `LoginReqCallback`/`SchemaFieldExtractionResult`
  remain (grep clean). Adversarial review passed PER shape against plan AND real code before marking done.
- [ ] Archive the change (`openspec archive 2026-05-31-session-auth-subshapes`) once merged.
