# Chat Session Model

The chat session is the **parent** of entity state, conversation,
and viewer events. This is the foundation the whole onboarding +
steady-mode flow sits on.

## The shape

```
ChatStoreState
├── ownerKey               (anonUserId or groundxUsername)
├── sessions: Map<id, ChatSession>
└── activeSessionId

ChatSession
├── id, title, createdAt, updatedAt
├── messages: ChatMessage[]              # conversation axis
├── summaries: ConversationSummary[]      # compression chain
├── entities: Map<EntityKey, EntitySession>  # entity axis (replaces global EntityRegistry)
├── activeEntityKey
├── viewerHistory: ViewerEvent[]          # viewer axis
├── currentIntent: CanvasIntent
├── gate: GateStatus                      # onboarding-specific
├── signupOpen: boolean
└── isOnboardingSession: boolean
```

`EntitySession` represents a sample / project / report tab the
user has visited inside this chat session — its `lastFrame`,
`completedFrames`, `scanProgress`, `extractedValues`.

A user's onboarding session has exactly one ChatSession
(`isOnboardingSession: true`). Steady mode has N.

## Storage strategy — anon vs signed-in

This is the rule that drove the DB schema design. Memorize it.

| Concept | Anonymous | Authenticated |
|---|---|---|
| **Content** (chat sessions, messages, summaries, entities) | **localStorage only** — anonymous content is browser-local | **DB primary** + localStorage as cache |
| **Telemetry** (intent_log, viewer_events, gate_event, page_usage_event) | **DB** — rows tied to `anonymous_user_id` | **DB** — rows tied to `groundx_username` |

Why the split: anonymous users get free-tier exploration without
the BFF needing to provision DB rows for every casual visitor.
Telemetry is always DB because metering + analytics + audit can't
trust client-controlled data.

On sign-up (F6 commit), the **login-claim flow** flips
ownership:

1. Client serializes ChatStore state into the
   `claimAnonymousChat` wire format
   (`app/src/api/claimAnonymousChat.ts`).
2. POST `/api/chat-sessions/claim` to the BFF.
3. Middleware calls `repository.claimAnonymousChatPayload(ownerUserId, payload)`:
   - One transaction, all-or-nothing.
   - INSERT each chat_session / chat_message / chat_session_entity /
     viewer_event under the new `ownerUserId`, nulling out
     `ownerAnonId`.
   - Anonymous-tagged telemetry rows already in DB
     (`viewer_events` for anon users) get their owner updated
     separately by the auth flow that creates the user.
4. Local storage stays as cache (writes-through to DB after this).

## The three axes the LLM sees

When the chat router (`middleware/src/services/chatRouter.ts`)
calls the LLM, it bundles three axes via
`bundleChatContext()`:

1. **Conversation axis** — `latestSummary` + `liveTail`. The
   latest summary is the head of the compression chain (a written
   compression of older messages); the live tail is every message
   that hasn't been compressed yet.
2. **Current entity axis** — `entityKey`, `lastFrame`,
   `completedFrames`, `extractedValues`. What the user is looking
   at right now.
3. **Viewer trail axis** — recent slice of `viewer_events`
   (typically last 10). Always server-side (telemetry, not user
   content).

Where each axis is read from:

| Axis | Anonymous | Authenticated |
|---|---|---|
| `conversation` | request body (client ships from localStorage) | DB (`chat_messages` + latest `conversation_summary`) |
| `currentEntity` | request body | DB (`chat_session_entities`) |
| `viewerTrail` | DB (`viewer_events`, by `anon_user_id`) | DB (`viewer_events`, by `groundx_username`) |

Both paths converge in the same `bundleChatContext()`
implementation; only the read source for the content axes differs.

## Compression chain

The router runs token counting on the assembled bundle BEFORE the
LLM call. If `shouldCompress(estimatedTokens, contextWindow)` is
true (>=70% of context window), it triggers compression:

1. `planCompression(liveTail, latestSummaryId, target)` walks the
   tail oldest-first and picks the message range to summarize.
   Always leaves at least one live-tail message intact as the
   LLM's prompt anchor.
2. (Future) The router asks the LLM to summarize that range.
3. Writes a new `conversation_summary` row with
   `absorbed_summary_ids = [previous_summary_id, ...]`.
4. Marks absorbed messages with
   `compressed_into_summary_id = <new summary id>` so
   `listChatMessages()` filtered by `compressed_into_summary_id IS NULL`
   returns just the live tail.

The token-count + plan logic exists (`contextBundler.ts`). The
LLM call itself + the DB writer for the summary row land with the
real LLM router track (#70).

## Migrating an anonymous session to signed-in

Two parts move:

1. **Content** (chat_sessions, chat_messages, chat_session_entities,
   conversation_summaries) — currently localStorage-only, gets
   INSERTed into DB via `claimAnonymousChatPayload`.
2. **Telemetry** (intent_log, viewer_events, gate_event,
   page_usage_event) — already in DB tagged with `anon_user_id`,
   gets `UPDATE … SET groundx_username = ?` on the matching rows.

Per locked decision: pre-signin page-usage rows do NOT count
toward the post-signin page budget. The counter resets at
sign-in.

## ViewerEvent recording

Every user-action boundary in `OnboardingSessionContext` calls
`appendViewerEvent`:

| Action | When | Detail |
|---|---|---|
| `opened` | pickScenario fires | `{ entityKey }` |
| `frame-advanced` | advanceFrame fires | `{ from, to }` |
| `left` | advanceFrame back to f1 | `{ from }` |
| `intent-dispatched` | openGate / dismissGate / commitGate | `{ intent, trigger?, method? }` |
| `citation-clicked` | F3 field row click | `{ field, citationId }` (future) |
| `extracted-value-viewed` | F3 field row click | `{ field }` (future) |
| `scan-completed` | F2 thinking stream finishes | `{ entityKey }` (future) |

Anonymous viewer events are POSTed to `/api/onboarding/viewer-events`
(future endpoint) and persisted under `anon_user_id`. Authenticated
flows write directly via the chat-session repository methods.

## What "Entity" means

An EntityKey is `kind:id` — e.g. `sample:utility`, `project:abc-123`,
`report:r-456`. Kinds:

- `sample` — a pre-canned scenario (utility / loan / solar).
- `project` — a real customer project in steady mode.
- `report` — a Smart Report being built.

The onboarding session almost always has one active entity at a
time (the picked sample). BYO branches don't activate an entity
until the user signs in + uploads, because there's no GroundX
resource to point at yet.

Memory rule: **gate is session-level, NOT per-entity.** "BYO" is
NOT an EntityKind. The F6 gate flow flips
`session.gate.status = "open"` with a trigger label; the active
entity is whatever was active when the gate opened.
