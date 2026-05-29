# Tasks — widget-llm-integration follow-up

Captures the 8 deferred items from
`archive/2026-05-28-2026-05-27-widget-llm-integration/`. Each was
deliberately deferred during the parent epic; this file makes the
status durable. Clusters are independent — pick up either or both
when a forcing function appears.

## Cluster A — Fenced-JSON retirement

### A.1 — `propose_schema_field` mutate tool

- [x] **Failing test:** `chatRouter.test.ts` — `propose_schema_field`
      mutate tool call lands on `reply.suggestedActions[]` (key
      `tool:propose_schema_field`) with the validated payload as
      `detail.arguments`.
- [x] Add `proposeSchemaField` to `SERVER_TOOL_CATALOG` in
      `middleware/src/services/toolCatalog.ts` with Zod schema for
      `{ name, type, description, categoryId }`.
- [x] Mirror on app side: add
      `chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard.tools.ts`
      declaring `propose_schema_field` (mutate category).
- [x] Remove the `proposedSchemaField` branch from
      `parseGroundedAnswer` once consumers migrate (see A.4).

### A.2 — `suggest_intent` mutate tool

- [x] **Failing test:** `chatRouter.test.ts` — `suggest_intent` tool
      call surfaces on `reply.suggestedActions[]` and dispatches
      via the existing tool:* path on click.
- [x] Add `suggestIntent` to `SERVER_TOOL_CATALOG` with Zod schema
      for `{ intent: string, reason: string, confidence?: number }`.
- [x] Where to declare: the parent epic catalogs `suggestIntent` as
      a chat-router-level tool, not a widget-owned tool. Place it
      on a new server-only catalog entry (or, if a host widget
      surfaces — `SuggestedActionChips` itself — co-locate there).
- [x] Decision needed: keep the legacy `suggested-intent` chip key
      for back-compat, or migrate fully to `tool:suggest_intent`?
      Pick the latter and add a one-release `key === "suggested-intent"`
      compatibility shim in `SuggestedActionChips`.

### A.3 — Update grounded LLM prompt

- [x] **Failing test:** `chatRouter.test.ts` — the system prompt
      sent to the LLM no longer describes a `proposedSchemaField`
      JSON envelope (only `citations` + tool-call instructions).
- [x] Strip the `proposedSchemaField` schema from `callGroundedLlm`'s
      system prompt.
- [x] Strip the `suggestedIntent` schema from the system prompt.
- [x] Add explicit tool-call usage guidance (when to call
      `propose_schema_field` vs `suggest_intent` vs just answering).
- [x] Keep the `citations` block — citations are metadata on the
      answer, not a tool. The fenced-JSON parser retains its
      citations branch.

### A.4 — Migrate consumers + retype ChatReply

- [x] **Failing test:** `ChatColumn.test.tsx` — `proposeSchemaField`
      from `reply.intents[]` (or its derived shim) renders the
      `<ProposeSchemaFieldCard>` inline with the assistant bubble.
- [x] Derive `ChatReply.proposedSchemaField` from `intents[]` /
      `suggestedActions[]` as a back-compat shim.
- [x] Update `ChatColumn` to read from the unified surface.
- [x] Update `views/Onboarding/ExtractView.tsx` similarly.
- [x] One-release deprecation window on `proposedSchemaField` field
      on the wire shape; then delete.

### A.5 — Delete the fenced-JSON parser

- [x] **Failing test:** `chatRouter.test.ts` — the parser's
      `proposedSchemaField` + `suggestedIntent` branches are gone;
      a fenced JSON block in the LLM response is parsed only for
      `citations`.
- [x] Delete `parseSuggestedIntentFromAnswer` (or whichever helper
      handles those branches in `parseGroundedAnswer`).
- [x] Deprecate `ChatReply.proposedSchemaField` field — keep the
      shim through one release, then remove from `ChatReply` type.
- [x] Update specs/chat-routing/spec.md to drop the fenced-JSON
      requirements.

## Cluster B — Mutate-tool widget upgrades

### B.1 — `chat-widgets/ProposeSchemaFieldCard`

- [x] **Failing test:** `ProposeSchemaFieldCard.tools.test.ts` —
      `accept_proposal({fieldId})` + `reject_proposal({fieldId})`
      handlers produce the right `CanvasIntent`.
- [x] Add new `CanvasIntent` variants in
      `contexts/CanvasOrchestratorContext/types.ts`:
      `{ kind: "acceptSchemaField", fieldId }` +
      `{ kind: "rejectSchemaField", fieldId }`.
- [x] Add orchestrator handlers in `CanvasOrchestratorContext.tsx`
      that dispatch to existing `ChatStore.addSchemaField` /
      `dismissFieldProposal` actions.
- [x] Delete `no-llm.md`; create `ProposeSchemaFieldCard.tools.ts`
      with the two tools (mutate category; `availableSteps:
      ["extract-workbench", "interact-chat"]`).
- [x] Mirror on middleware `toolCatalog.ts`.
- [x] Update widget README: swap `## LLM tools` body from "see
      no-llm.md" to the actual tool list.

### B.2 — `chat-widgets/GateChatRail`

- [x] **Failing test:** `GateChatRail.tools.test.ts` —
      `commit_gate({method})` + `dismiss_gate()` handlers produce
      the right `CanvasIntent`.
- [x] Add `CanvasIntent` variants:
      `{ kind: "commitGate", method }` + `{ kind: "dismissGate" }`.
- [x] Add orchestrator handlers wired to
      `OnboardingSessionContext.commitGate` / `dismissGate`.
- [x] Delete `no-llm.md`; create `GateChatRail.tools.ts`.
- [x] Mirror on middleware `toolCatalog.ts`.
- [x] Update widget README.

### B.3 — `chat-widgets/BookingStatusCard`

- [x] **Failing test:** `BookingStatusCard.tools.test.ts` —
      `book_call()` produces the right `CanvasIntent`.
- [x] Add `CanvasIntent` variant: `{ kind: "openBookCall" }`.
- [x] Add orchestrator handler that sets `?bookCall=1` on the URL
      (the OnboardingShell already watches this to mount
      `BookCallView`).
- [x] Delete `no-llm.md`; create `BookingStatusCard.tools.ts`.
- [x] Mirror on middleware `toolCatalog.ts`.
- [x] Update widget README.

## Closure

- [x] OpenSpec `validate --all --strict` passes (spec deltas land
      on `chat-routing` for fenced-JSON deprecation + `agent-tools`
      for the 5 new tools).
- [x] App tests + middleware tests green.
- [x] Drift guards green.
- [x] Round-trip closure for each new tool.
- [x] Archive the change.
