# Spec Delta — chat-routing

## REMOVED Requirements

### Requirement: routeChat SHALL invoke tool calls when the LLM emits them

**Reason**: stale — contradicted by two later durable requirements in this
spec and by shipped code. It mandated executed tool-call records on
`ChatRouterResponse.tools` sourced from an `AgentToolBus` registry; the
shipped contract (per "Chat replies SHALL carry intents and toolFailures
when the LLM uses function-calling") routes read-tool results to
`reply.intents[]`, mutate-tool proposals to `reply.suggestedActions[]`
chips, and failures to `reply.toolFailures[]`, and (per "The chat router
SHALL pass a step-scoped tool catalog to the LLM provider") the router
SHALL NOT call into an app-side `toolRegistry` — the catalog is middleware
`SERVER_TOOL_CATALOG`, not `AgentToolBus`. Shipped code always returned
`tools: []` and nothing read it. Its live scenario (`show_extraction`
advancing the canvas) is covered by the intents/suggestedActions routing
requirement. The dead `ChatReply.tools` wire field is removed alongside.

## MODIFIED Requirements

### Requirement: Chat wire types SHALL be single-sourced from @groundx/shared with a compile-time drift guard

The `/api/chat/*` request/response contract SHALL be declared exactly once,
as `@groundx/shared` Zod schemas (`z.infer`), and BOTH the app
(`api/chatSessions.ts` `ChatReply` / `ChatReplyDebug` / `ChatDispatchedIntent`
/ `ChatToolFailure` / `CreateChatSessionResult` / `scopeHint`) and the
middleware (`services/chatRouterTypes.ts` `ChatRouterResponse` /
`ChatRouterDebug` / `DispatchedIntent` / `ToolFailure`) SHALL consume that one
source via re-export, keeping their local names as aliases. Each folded twin
SHALL carry a compile-time `Eq<Local, Shared>` drift guard that is
load-bearing under `npm run build` (the build fails if either side re-forks
the shape), AND a runtime Zod `validate` at each parse boundary
(`/api/chat/messages` reply, `POST /api/chat-sessions` result). The reply
envelope SHALL NOT carry a `tools` array — executed/proposed tool calls
travel exclusively on `intents[]` / `suggestedActions[]` / `toolFailures[]`
(2026-06-11; the former always-empty `ChatReply.tools` field is retired).

#### Scenario: A re-forked wire shape fails the build

- **GIVEN** the chat reply envelope is single-sourced on `@groundx/shared` with an `Eq<ChatReply, SharedChatReply>` guard
- **WHEN** a developer edits the app `ChatReply` (or middleware `ChatRouterResponse`) so it diverges from the shared schema
- **THEN** `Eq<…>` evaluates `false`, the `Assert<false>` fails, and `npm run build` (tsc) errors
- **AND** reverting the divergence restores a green build.

#### Scenario: The chat reply validates at the transport boundary

- **GIVEN** the `/api/chat/messages` route returns a chat reply
- **WHEN** the reply crosses the parse boundary
- **THEN** it is validated against the shared `chatReplySchema`
- **AND** a well-formed reply (citations, suggestedActions, intents, toolFailures, proposedSchemaField, optional `_debug`) parses successfully
- **AND** a reply carrying no `tools` key parses successfully (the field is retired from the envelope).
