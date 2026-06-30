# Retire the stale routeChat tool-invocation requirement + the dead `ChatReply.tools` wire field

## Why

The durable `chat-routing` requirement "routeChat SHALL invoke tool calls
when the LLM emits them" is stale and self-contradictory within its own spec:

- It says executed tool-call records surface on `ChatRouterResponse.tools`
  and that the registry sources from `AgentToolBus`. Both are contradicted
  by two LATER durable requirements in the same spec: "Chat replies SHALL
  carry intents and toolFailures when the LLM uses function-calling"
  (read tools → `intents[]`, mutate tools → `suggestedActions[]` chips,
  failures → `toolFailures[]`) and "The chat router SHALL NOT call into an
  app-side `toolRegistry` or app-side tool `handler`" (the step-scoped
  catalog requirement — the registry is middleware `SERVER_TOOL_CATALOG`,
  not `AgentToolBus`).
- Shipped code agrees with the later requirements: `ragPipeline.ts` and
  `structuredHandler.ts` ALWAYS return `tools: []`; no app code reads
  `reply.tools` (verified by grep — the only mention is a historical
  comment in `mysqlRepository.test.ts` noting nothing ever read it back).

Because the field is dead on every reply, the shared wire schema's
`chatReplySchema.tools` is dormant plumbing (discipline §8 / principles §5):
a required always-empty array both sides must fabricate and validate.
Remove it in the same change rather than ticketing it — the removal is a
two-file mechanical edit covered by the same tests.

## What

1. **Spec delta (chat-routing)**
   - REMOVE the requirement "routeChat SHALL invoke tool calls when the
     LLM emits them" — superseded by the intents/suggestedActions/
     toolFailures routing requirement and the step-scoped-catalog
     requirement (no app-side registry).
   - MODIFY "Chat wire types SHALL be single-sourced from @groundx/shared
     with a compile-time drift guard" — drop `tools` from the
     well-formed-reply field list (the envelope no longer carries it).
2. **Code**
   - `shared/src/index.ts`: remove `tools` from `chatReplySchema`.
   - `middleware/src/services/ragPipeline.ts` + `structuredHandler.ts`:
     stop fabricating `tools: []` on every reply envelope. (The LLM
     **request** `tools` parameter — the function-calling catalog — is
     untouched; only the reply field dies.)
   - App test fixtures that hand-build replies drop the `tools: []` key.
   - Eq drift guards need no edit: both sides re-export the shared type,
     so the guard pins the new shape automatically; `tsc` confirms.

## Out of scope

- The LLM request-side `tools` catalog (step-scoped catalog requirement) —
  unchanged.
- `intents[]` / `suggestedActions[]` / `toolFailures[]` semantics —
  unchanged; they are the surviving contract this change aligns the spec to.
- DB schema — no column stores `reply.tools` (already dropped historically).

## Conformance to core architectural decisions

- **Composable, not forked (principle 1):** removes a dead axis rather than
  adding one; no new abstraction, so no second-caller test applies.
- **One source of truth (principle 6):** `chatReplySchema` in
  `@groundx/shared` remains the single wire shape; both sides keep
  consuming it via re-export under the existing `Eq<>` guards.
- **Done-able (principle 5):** done = a reply without `tools` parses at the
  app's `chatReplySchema` boundary AND `rg "tools: \[\]"` over reply
  envelopes returns nothing AND builds + suites are green.
- **No dormant plumbing (discipline §8):** this change deletes dormant
  plumbing; it leaves none behind.
