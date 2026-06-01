# Promote a single shared `canvasIntentSchema` validated at every `current_intent_json` boundary

## Why

The `CanvasIntent` discriminated union is declared once, app-side, in
`contexts/CanvasOrchestratorContext/types.ts`. The orchestrator's `dispatch()`
switch + `assertNeverIntent` enforce compile-time exhaustiveness over it — but
that protection is purely a *type*. The same value is persisted to the
`chat_sessions.current_intent_json` arbitrary-JSON column, and BOTH ends that
read it back trust the wire blindly:

- **App hydration** (`coerceHydratedIntent` in `ChatStoreContext.tsx`) does a
  STRUCTURAL guard only — it accepts any plain object carrying a non-empty
  string `kind` and then `return raw as CanvasIntent`. A corrupt or legacy
  persisted row (`{ kind: "openDocument" }` with no `documentId`, or a `kind`
  that is not a real discriminant) is blind-cast into the strict
  `currentIntent: CanvasIntent | null` state and handed to the orchestrator.
- **Middleware row mapping** (`rowToChatSession` in `mysqlRepository.ts`)
  does `parseJsonColumn(row.current_intent_json) as ChatSessionRecord["currentIntent"]`
  — an unchecked cast of whatever the column holds.

So there is no single source of truth for what a `CanvasIntent` *is* at runtime,
and a malformed persisted intent can masquerade as a typed intent on the read
path. The structural guard's own docstring already names the fix as pending:
"full validation needs a shared Zod `CanvasIntent` schema (none exists yet)".
This is the MEDIUM follow-up carried open from
`2026-05-31-core-data-followups/tasks.md` §4.

This conforms to the project's tier-1 principle of **one source of truth**
(`@groundx/shared` Zod) and the existing pattern there: `citationSchema` +
`parseCitations`, `templateSchema` + `parseTemplate`, `contentScopeSchema`.
`CanvasIntent` is the last unguarded cross-boundary contract of its class.

## What Changes

- Add ONE `canvasIntentSchema` (Zod discriminated union on `kind`) to
  `@groundx/shared`, with `export type CanvasIntent = z.infer<...>` and a
  `parseCanvasIntent(input: unknown): CanvasIntent | null` safe-parse helper
  that mirrors the existing `parseCitations` / `parseTemplate` convention
  (returns `null` on invalid input rather than throwing).
- App side: `contexts/CanvasOrchestratorContext/types.ts` re-exports the
  `CanvasIntent` type from `@groundx/shared` (single source of truth) instead of
  hand-declaring the union. The orchestrator `dispatch()` switch +
  `assertNeverIntent` continue to drive exhaustiveness off the same `kind`
  discriminator — behavior-preserving for valid intents.
- App boundary: `coerceHydratedIntent` validates with `parseCanvasIntent`
  (full structural + variant validation) instead of the blind structural cast,
  so a corrupt/legacy persisted intent coerces to `null` rather than flowing
  into the orchestrator.
- Middleware boundary: `rowToChatSession` validates `current_intent_json`
  through the shared schema (coerce-to-`null` on invalid) instead of the
  unchecked cast.
- This is the third independent caller of a single Zod contract (app
  hydration + middleware mapper + the orchestrator type) — the abstraction is
  earned, not speculative.

## Out of scope

- The orchestrator `dispatch()` exhaustiveness switch + `assertNeverIntent`
  themselves (shipped in `2026-05-31-core-data-followups` §4d, #14).
- Re-keying anon→signed-in sessions, retention sweeps, or any other
  `chat_sessions` column.
- The row-mapper union validation for `intent_kind` / `last_frame` /
  `entity_key` free-string columns (shipped in §4c).
