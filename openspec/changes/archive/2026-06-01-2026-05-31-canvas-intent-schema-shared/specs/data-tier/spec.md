## ADDED Requirements

### Requirement: Persisted canvas intents SHALL be validated through the shared schema at the row boundary

The persistence layer SHALL treat the `chat_sessions.current_intent_json` column as untrusted arbitrary JSON. When mapping a row back into a `ChatSessionRecord`, the middleware SHALL validate `current_intent_json` through the single shared `canvasIntentSchema` (`@groundx/shared`) rather than casting the deserialized column blindly. A value that fails validation SHALL be mapped to `null`; a valid value SHALL pass through unchanged. This is the middleware twin of the app-side hydration guard — both ends of the persisted intent boundary derive from the one shared schema, so a corrupt or legacy persisted intent cannot enter either runtime as a typed `CanvasIntent`.

#### Scenario: A malformed persisted intent maps to null in the middleware row mapper

- **GIVEN** a `chat_sessions` row whose `current_intent_json` deserializes to a malformed intent (a string `kind` but missing the variant's required fields, or a `kind` that is not a real discriminant)
- **WHEN** `rowToChatSession` maps the row into a `ChatSessionRecord`
- **THEN** the record's `currentIntent` is `null`
- **AND** every other field of the mapped record is unaffected

#### Scenario: A valid persisted intent round-trips through the row mapper unchanged

- **GIVEN** a `chat_sessions` row whose `current_intent_json` holds a well-formed `{ "kind": "openDocument", "documentId": "util-1", "page": 2 }`
- **WHEN** `rowToChatSession` maps the row
- **THEN** the record's `currentIntent` equals the persisted intent (behavior preserved for valid intents)
