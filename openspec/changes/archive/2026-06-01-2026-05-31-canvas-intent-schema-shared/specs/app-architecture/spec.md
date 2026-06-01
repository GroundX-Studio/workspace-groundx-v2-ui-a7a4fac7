## MODIFIED Requirements

### Requirement: The intent dispatch surface SHALL be the single execution path for canvas state changes

`CanvasOrchestratorContext.dispatch()` SHALL be the only path that turns a `CanvasIntent` into an in-app state change. The previously-defined `registerAdapter` mechanism is RETIRED — no widget today uses it, and the design favors a single switch inside `dispatch()` over a runtime registration plane (one place to read every intent's behavior).

Built-in handlers inside `dispatch()` SHALL cover every intent kind defined in the `CanvasIntent` union. An intent kind that is type-defined but has no handler SHALL be flagged as a drift signal (TypeScript exhaustiveness check in the dispatch switch).

The `CanvasIntent` union SHALL be defined by a single shared Zod schema (`canvasIntentSchema`) in `@groundx/shared`; the app `CanvasIntent` type SHALL be derived from it via `z.infer` (one source of truth — the app MUST NOT hand-declare a rival union). The dispatch exhaustiveness check SHALL continue to switch on the same `kind` discriminator. Every boundary that reads or writes a persisted `CanvasIntent` (the `chat_sessions.current_intent_json` arbitrary-JSON column) SHALL validate it through the shared schema rather than blind-casting it: an intent that fails validation SHALL coerce to `null` rather than flow into the orchestrator as a typed intent, and a valid intent SHALL pass through unchanged.

#### Scenario: A new intent kind without a handler fails type-checking

- **GIVEN** a new `CanvasIntent` kind is added to the union in `contexts/CanvasOrchestratorContext/types.ts`
- **WHEN** `npx tsc --noEmit` runs
- **THEN** the exhaustiveness check inside `dispatch()` fails with an error naming the unhandled kind

#### Scenario: An LLM tool dispatches its produced intent through the canonical orchestrator path

- **GIVEN** the LLM emits a tool call for `open_document`
- **WHEN** the middleware validates the call + invokes the tool's handler
- **THEN** the result is a `CanvasIntent` with `kind === "highlightCitation"`
- **AND** the frontend receives the intent via `ChatReply.intents[]`
- **AND** dispatching that intent through the orchestrator produces the same state change as a `CiteChip` click

#### Scenario: A corrupt persisted intent is rejected on hydration, not blind-cast

- **GIVEN** a server `chat_sessions` row whose `current_intent_json` holds a malformed intent (a real-looking `kind` but missing the variant's required fields, e.g. `{ "kind": "openDocument" }` with no `documentId`)
- **WHEN** `ChatStoreServerHydrator` hydrates the session and `coerceHydratedIntent` runs the value through `parseCanvasIntent`
- **THEN** the hydrated session's `currentIntent` is `null` (the corrupt value does NOT masquerade as a typed `CanvasIntent` in the orchestrator)
- **AND** the rest of the session row hydrates unaffected

#### Scenario: A valid persisted intent round-trips unchanged

- **GIVEN** a server `chat_sessions` row whose `current_intent_json` holds a well-formed `{ "kind": "openDocument", "documentId": "util-1", "page": 2 }`
- **WHEN** the session hydrates through `coerceHydratedIntent` / `parseCanvasIntent`
- **THEN** the hydrated `currentIntent` equals the persisted intent (behavior preserved for valid intents)
