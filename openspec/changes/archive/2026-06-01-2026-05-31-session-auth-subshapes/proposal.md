# Session/auth + rehydration sub-shapes — illegal-states unrepresentable

## Why

`2026-05-31-core-data-followups` item #20 ("illegal-states") closed the core piece — the
in-memory request session is now `AnonSession | AuthedSession` (no empty-string `groundxUsername`
sentinel) with the full reader migration done in step 2-7g. Three flat-record sub-shapes from that
item were left open and are tracked here so none reverts to a silent placeholder:

- `LoginReqCallback` (`app/src/contexts/AuthContext/AuthContext.tsx`) is a flat record of three
  independent booleans (`isLoggedIn`, `error`, `banned`). The combinations
  `{isLoggedIn:true; error:true}`, `{isLoggedIn:true; banned:true}`, and
  `{isLoggedIn:false; error:false; banned:false}` (a silent no-op) are all representable but
  meaningless — the producer (`AuthProvider.login`) only ever emits success, thrown-error, and
  no-response variants, so the type is wider than the value space.
- `SchemaFieldExtractionResult` (`app/src/contexts/ChatStoreContext/types.ts`) models success vs
  failure vs pending as a single flat record (`status: "pending"|"done"|"error"` PLUS a
  `value`/`confidence`/`citation` that are only meaningful when `status === "done"`). A `"pending"`
  result with a non-null `value`, or an `"error"` result carrying a `confidence`, is representable
  but illegal.
- The ChatStore localStorage rehydration path (`ChatStoreContext.tsx` `deserialize`) trusts the
  blob: `JSON.parse(raw) as SerializedSnapshot`. A corrupt or attacker-shaped snapshot is cast,
  not parsed — the only guard today is the top-level `try/catch` plus a `version` equality check,
  which does NOT reject a structurally wrong payload that happens to JSON-parse.

Each is a trust boundary or a state machine being modeled as a flat record. Making the illegal
combinations unrepresentable (discriminated unions) and validating at the localStorage boundary
(Zod parse) closes the class of defect for these three shapes. Behavior-preserving for every valid
input.

## What Changes

1. **`LoginReqCallback` → discriminated union.** Replace the three-boolean flat record with a
   `{ kind: "success" } | { kind: "error"; error: unknown } | { kind: "banned" } | { kind: "failed" }`
   union (exact variant set derived from the producer's real branches), so the meaningless boolean
   combinations and the silent all-false no-op are unrepresentable. Migrate `AuthProvider.login`
   (the one producer) and every consumer to narrow on `kind`. Behavior-preserving: each old
   boolean tuple maps 1:1 to exactly one variant.
2. **`SchemaFieldExtractionResult` → discriminated union.** Model the three states as explicit
   variants: `{ status: "pending" }` · `{ status: "done"; value; confidence?; previousConfidence?;
   citation? }` · `{ status: "error"; message? }`. The success-only fields (`value`, `confidence`,
   `citation`) live ONLY on the `"done"` arm, so a pending/error result cannot carry them. Migrate
   the producer (`ChatStoreContext.setSchemaFieldExtraction`) and the SchemaView consumers to
   narrow on `status`. Behavior-preserving: existing `"done"` records keep their exact field set.
3. **`parseChatStoreSnapshot(unknown)` validator at the localStorage boundary.** Add a Zod-based
   `parseChatStoreSnapshot(unknown): SerializedSnapshot | null` that validates the parsed blob
   shape (sessions, entities, version) and returns `null` on a corrupt/mismatched snapshot instead
   of casting. `deserialize` calls it in place of `JSON.parse(raw) as SerializedSnapshot`. A
   corrupt snapshot is rejected (falls back to legacy migration / fresh store), never trusted.
   Behavior-preserving: a valid current-version snapshot parses to the identical state it does today.

Each shape lands failing-first: a test constructing the illegal/old flat shape that the new
union/validator rejects (RED before the union/validator exists, GREEN after).

## Out of scope

- The session-auth `AnonSession | AuthedSession` union and its ~16-reader migration — already DONE
  in `core-data-followups` step 2-7g. This change does NOT re-touch `middleware/src/middleware/session.ts`.
- The DB `SessionRecord` string column (a schema change, intentionally out of scope upstream too).
- A snapshot schema-version bump or migration of the serialized format — the validator rejects
  unknown shapes; it does not migrate them (legacy migration already exists separately).

## Affected

- App: `contexts/AuthContext/{AuthContext.tsx,AuthProvider.tsx}` + login consumers
  (`LoginReqCallback`); `contexts/ChatStoreContext/{types.ts,ChatStoreContext.tsx}` +
  `components/viewer-widgets/Extract/SchemaView.tsx` (`SchemaFieldExtractionResult`); the ChatStore
  rehydration path (`parseChatStoreSnapshot`).
- Specs: `auth-and-sessions` (the durable contract: session/auth + rehydration shapes are
  discriminated unions validated at trust boundaries — no flat-record sentinels).

## Conformance to core architectural decisions

- **Solve to the model — make illegal states unrepresentable.** Each fix collapses a flat record
  (whose type is wider than its value space) onto a discriminated union or validates it at the
  trust boundary. It removes representable-but-illegal combinations; it adds no parallel
  implementation.
- **Validate at trust boundaries.** localStorage is untrusted input; the snapshot is parsed, not
  cast — the same posture as the row-mapper validation in `core-data-followups`.
- **Done-able + behavior-preserving.** Every valid input keeps its exact prior outcome; each shape
  lands behind a failing-first test, not a silent TODO.
