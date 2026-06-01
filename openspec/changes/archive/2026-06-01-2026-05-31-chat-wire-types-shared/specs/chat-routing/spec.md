## ADDED Requirements

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
(`/api/chat/messages` reply, `POST /api/chat-sessions` result). The fold SHALL
be behaviour-preserving — a source-of-truth move only, no change to the
runtime payload.

#### Scenario: A re-forked wire shape fails the build

- **GIVEN** the chat reply envelope is single-sourced on `@groundx/shared` with an `Eq<ChatReply, SharedChatReply>` guard
- **WHEN** a developer edits the app `ChatReply` (or middleware `ChatRouterResponse`) so it diverges from the shared schema
- **THEN** `Eq<…>` evaluates `false`, the `Assert<false>` fails, and `npm run build` (tsc) errors
- **AND** reverting the divergence restores a green build.

#### Scenario: The chat reply validates at the transport boundary

- **GIVEN** the `/api/chat/messages` route returns a chat reply
- **WHEN** the reply crosses the parse boundary
- **THEN** it is validated against the shared `chatReplySchema`
- **AND** a well-formed reply (citations, suggestedActions, tools, intents, toolFailures, proposedSchemaField, optional `_debug`) parses successfully
- **AND** the runtime payload is byte-identical to the pre-fold envelope.

### Requirement: The chat debug scope SHALL be the shared ContentScope, not a re-declared literal

The dev-only `_debug.scope` field SHALL be typed as the shared
`@groundx/shared` `ContentScope` on BOTH `ChatReplyDebug.scope` (app) and
`ChatRouterDebug.scope` (middleware), eliminating the duplicated
`{type, bucketId?, groupId?, documentIds?, filter?}` literal on each side. The
shared `chatReplyDebugSchema` SHALL embed `contentScopeSchema` for its `scope`
field, and both sides SHALL consume it via re-export under an `Eq<>` guard.

#### Scenario: Both debug-scope twins derive from one ContentScope

- **GIVEN** the app `ChatReplyDebug` and middleware `ChatRouterDebug` are both re-exports of the shared `chatReplyDebugSchema`
- **WHEN** the chat router writes `_debug.scope` and the dev-console logger reads `reply._debug.scope`
- **THEN** both sides type-check against the shared `ContentScope` discriminated union
- **AND** no `{type,bucketId,groupId,documentIds,filter}` literal is re-declared on either side
- **AND** an `Eq<ChatReplyDebug, SharedChatReplyDebug>` guard pins the twin under the build.

### Requirement: A single shared Source union SHALL back every event-source enum

The four-value source enum `["user", "agent", "tour", "system"]` SHALL be
single-sourced as one `@groundx/shared` `sourceSchema` (`z.enum`) with type
`Source`, replacing the 7× duplication (middleware `viewerEventSourceSchema`,
`intentLogSourceSchema`, two `app.ts` allow-sets; app `ChatStoreContext` event
source, `intentLog`, `viewerEvents`). The canvas-orchestrator `IntentSource`
(`"user" | "agent" | "tour"`) SHALL be derived as `Exclude<Source, "system">`
from the same union rather than re-declared. Each consuming side SHALL carry
an `Eq<>` guard so the source vocabulary cannot drift between halves.

#### Scenario: IntentSource derives from the shared Source union

- **GIVEN** the shared `sourceSchema` is `z.enum(["user","agent","tour","system"])`
- **WHEN** `IntentSource` is defined
- **THEN** `IntentSource = Exclude<Source, "system">` resolves to `"user" | "agent" | "tour"`
- **AND** an `Eq<IntentSource, Exclude<Source,"system">>` guard holds at build time
- **AND** the middleware fallback consts and `app.ts` allow-sets derive their member set from `sourceSchema.options`.

### Requirement: SchemaFieldExtractionResult SHALL be single-sourced from @groundx/shared

The `SchemaFieldExtractionResult` shape SHALL be defined once as a
`@groundx/shared` schema and consumed via re-export, with an `Eq<>` guard and
a runtime validate so any future middleware producer of the same shape shares
the one source. It is today declared only on the app in
`ChatStoreContext/types.ts` and consumed by `ChatStoreContext.tsx` +
`SchemaView.tsx`.

#### Scenario: The schema-field extraction result parses against the shared schema

- **GIVEN** the app `SchemaFieldExtractionResult` is a re-export of the shared `schemaFieldExtractionResultSchema`
- **WHEN** a field extraction result is set on the ChatStore
- **THEN** it validates against the shared schema
- **AND** an `Eq<SchemaFieldExtractionResult, SharedSchemaFieldExtractionResult>` guard pins the shape under the build.

### Requirement: The X-Ray response-shape and PageDim twins SHALL be deferred to wf05b

This change SHALL NOT fold the X-Ray response-shape twin nor the WF-03
`PageDim` shape; both are deferred to `2026-05-29-wf05b-word-level-geometry`.
The X-Ray twin (`documentPages[].number` vs `.page` vs `pageNumber`) and the
WF-03 `PageDim` (`{number, width, height}`) shape are declared in middleware
`services/citationGeometry.ts` and app `api/entities/groundxDocumentsEntity.ts`.
They are
shared ownership with `2026-05-29-wf05b-word-level-geometry`, whose `proposal.md`
and `tasks.md` both claim coordination of the X-Ray field-name drift. This
change SHALL leave the `citationGeometry.ts` page/X-Ray shapes untouched to
avoid a double-fix and a merge collision on that file.

#### Scenario: This change does not touch the citationGeometry page/X-Ray shapes

- **GIVEN** the X-Ray + `PageDim` twins are co-owned with wf05b
- **WHEN** this change's folds land
- **THEN** `services/citationGeometry.ts`'s `PageDim` and X-Ray `documentPages` shapes are unchanged
- **AND** the deferral is recorded as a cross-plan dependency, not an in-scope fold.
