# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: The tool catalog SHALL include 5 new mutate-category tools

After this change lands, the tool catalog SHALL include 5 new
mutate-category tools (`propose_schema_field`, `accept_proposal`,
`reject_proposal`, `commit_gate`, `dismiss_gate`, `book_call`)
plus `suggest_intent`. Each MUST be mirrored on both the app-side
widget catalog (`<Name>.tools.ts`) and the middleware-side
`SERVER_TOOL_CATALOG`. The drift-guard test on the server side
SHALL fail until both sides are in sync.

The widget-llm-integration epic shipped 2 read-category tools
(`open_document`, `jump_to_page` on `PdfViewer`). This follow-up
adds 5 mutate-category tools:

| Tool | Owning widget | Input | Intent |
|---|---|---|---|
| `propose_schema_field` | `ProposeSchemaFieldCard` | `{ name, type, description, categoryId }` | `proposeSchemaField` |
| `suggest_intent` | (server-only catalog entry) | `{ intent, reason, confidence? }` | maps to existing `switchFrame` mapping |
| `accept_proposal` | `ProposeSchemaFieldCard` | `{ fieldId }` | `acceptSchemaField` |
| `reject_proposal` | `ProposeSchemaFieldCard` | `{ fieldId }` | `rejectSchemaField` |
| `commit_gate` | `GateChatRail` | `{ method }` | `commitGate` |
| `dismiss_gate` | `GateChatRail` | `{}` | `dismissGate` |
| `book_call` | `BookingStatusCard` | `{}` | `openBookCall` |

All MUST conform to the quality rules from the parent epic
(snake_case, allowlisted verb prefix, `Use when …` clause in the
description, per-Zod-field `.describe()`).

#### Scenario: A new mutate tool routes through the Phase 8 chip path

- **GIVEN** the LLM emits a `commit_gate({method: "register"})` tool call
- **WHEN** the chat router validates the args against
  `GateChatRail.tools.ts`'s Zod schema
- **THEN** the tool call surfaces as
  `reply.suggestedActions[]` with key `tool:commit_gate` (the
  category-aware routing landed in the parent epic's Phase 8).
- **AND** clicking the chip dispatches a `commitGate` intent that
  the orchestrator routes to
  `OnboardingSessionContext.commitGate(method)`.

#### Scenario: The server tool catalog mirror stays in sync with the app-side widgets

- **GIVEN** a widget upgrade lands a new `<Name>.tools.ts` file
- **WHEN** the middleware-side `toolCatalog.test.ts` drift guard runs
- **THEN** the expected-name-set assertion fails until the
  middleware-side `SERVER_TOOL_CATALOG` is updated to mirror the
  new tool — forcing the author to keep both sides in sync.
