# Tasks — schema-agent-chat-affordances

## 1. Failing closure-gate tests

- [x] ChatColumn test: when `currentFrame === "f3a"`, render `chat-schema-agent-header` containing text `Schema Agent` and a sample-switcher chip `chat-schema-agent-sample-switcher` with the active sample name + `switch ▾` glyph.
- [x] ChatColumn test: omits the Schema-Agent header on F2 (frame-conditional render).
- [x] SchemaView test: when a session has summaries on `ChatSession.summaries`, render `chat-earlier-turns-summary` containing `▾ earlier turns (<P> proposals · <A> fields accepted)`.
- [x] SchemaView/ChatStore round-trip test: trigger a field rerun with confidence delta `0.83 → 0.98` → assert that the chat stream contains an assistant bubble whose text matches `/Re-ran on the sample: 16\.2 kW · confidence 0\.98 ↑ from 0\.83/`.

## 2. Implementation

- [x] Add `chat-schema-agent-header` block to `ChatColumn.F2ConversationFlow` (rendered only when `currentFrame === "f3a"`).
- [x] Sample-switcher chip reads `scenarioName` (already in scope from the scenario manifest).
- [x] Add `chat-earlier-turns-summary` element above the conversation when `activeChatSession.summaries.length > 0`. `<P>` derives from `addedFields.length + pendingFieldProposals.length` (proposals seen); `<A>` derives from `addedFields.length` (proposals accepted).
- [x] Add ChatStore action `appendAgentMessage(content: string)` that pushes a new assistant `ChatMessage` (id prefix `agent-`) to the active session.
- [x] Add a ChatColumn effect that projects ChatStore-emitted agent messages (`id.startsWith("agent-")`) into the rendered `liveTurns` list so they reach the conversation surface.
- [x] In SchemaView's `fireExtraction`, capture the prior `confidence` BEFORE the pending wipe; on `status: "done"` with a delta, call `appendAgentMessage` with `Re-ran on the sample: <value>[ <format>] · confidence <new> ↑ from <old>`.
- [x] Thread `field.format` through the rerun callsite so the unit suffix surfaces (e.g. `16.2 kW`).

## 3. Cross-checks

- [x] Dead-context: `ChatSession.summaries` is now READ by ChatColumn (surfacing the earlier-turns block).
- [x] Round-trip: covered by step 1 tests — `appendAgentMessage` writes into `ChatSession.messages`; ChatColumn's projection effect reads them; the rendered bubble carries the expected narration text.

## 4. Verification

- [x] vitest green (886/886 app suite).
- [x] tsc green on app side; pre-existing middleware errors unrelated.
- [x] `openspec validate schema-agent-chat-affordances --strict` green.
