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

## Storage strategy — DB is source of truth; localStorage caches

**Updated 2026-05-25.** The earlier "anon = localStorage only for
content" rule is gone. The current rule:

| Concept | Anonymous | Authenticated |
|---|---|---|
| **Content** (chat sessions, messages, summaries, entities) | **DB primary** + localStorage cache. `ownerAnonId` = the cookie's session.id | **DB primary** + localStorage cache. `ownerUserId` = `groundxUsername` |
| **Telemetry** (intent_log, viewer_events, gate_event, page_usage_event) | DB, tied to `anon_user_id` | DB, tied to `groundx_username` |

Why the rule changed: the live chat surface
(`POST /api/chat/messages` → chatHandler → RAG pipeline →
compression) needs a parent `chat_sessions` row server-side. Anon
users are ~95% of onboarding traffic — a localStorage-only path
meant the live surface was dark until F6 sign-up. Server-row-from-
day-one keeps the surface real for everyone.

Concrete client flow on each new session:
1. ChatStoreContext mints `c-<uuid>` (Phase A still applies).
2. `app/src/api/chatSessions.ts` `sendChatMessage()` runs an
   ensure-create POST against `/api/chat-sessions` before the
   first message goes out (cached per session id; invalidated on
   404).
3. Middleware writes the row with `ownerAnonId = req.session.id`
   for anon, `ownerUserId = groundxUsername` for authed.

On sign-up (F6 commit), the **login-claim flow** is now a single
re-key:

1. Client POSTs `/api/chat-sessions/claim` with **no body**. The
   anon id comes from the cookie — login reused `req.session?.id`
   so it still matches.
2. Middleware runs `repository.rekeyAnonymousChatSessions(anonId, ownerUserId)`:
   ```sql
   UPDATE chat_sessions
      SET owner_user_id = ?, owner_anon_id = NULL, updated_at = NOW()
    WHERE owner_anon_id = ?
   ```
3. Child rows (`chat_messages`, `conversation_summaries`,
   `chat_session_entities`, `viewer_events`) reference
   `chat_sessions.id` and inherit the new owner transitively. No
   need to touch them.
4. Response: `{ rekeyedSessions: number }`. localStorage stays as
   cache.

The old bulk-upload `serializeChatPayload` + `claimAnonymousChatPayload`
code is **gone**. If you see references to those names in older
notes or comments, treat them as stale.

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

**All three axes are read from DB for both anon and authed users**
(2026-05-25 shift). `chatHandler.handleChatMessage` calls
`listChatMessages`, `listConversationSummaries`,
`listChatSessionEntities`, and `listViewerEvents` against the
repository — no client-shipped content, no anon special case.

## Compression chain

The router runs token counting on the assembled bundle BEFORE the
LLM call. If `shouldCompress(estimatedTokens, contextWindow)` is
true (>=70% of context window), it triggers compression:

1. `planCompression(liveTail, latestSummaryId, target)` walks the
   tail oldest-first and picks the message range to summarize.
   Always leaves at least one live-tail message intact as the
   LLM's prompt anchor.
2. `summarizeChunk(messages, priorSummary, deps)` (in
   `conversationCompressor.ts`) builds the summary prompt
   (role-stamped USER:/ASSISTANT: turns + prior summary spliced
   in when chain depth > 0) and forwards a chat.completions
   request through the LlmClient. Temperature pinned at 0.1.
3. `runCompression(chatSessionId, plan, deps)` writes a new
   `conversation_summaries` row with the generation number (prior
   + 1) and `absorbedSummaryIdsJson` listing every prior summary
   it subsumes.
4. Marks absorbed messages with
   `compressed_into_summary_id = <new summary id>` via
   `markChatMessagesCompressed`. `listChatMessages()` filtered by
   `compressed_into_summary_id IS NULL` returns just the live tail.

**Phases I + J shipped 2026-05-24.** The whole chain runs in the
request hot path on the chatHandler thread today. Moving compression
to a background job is a deferred follow-up (see
`docs/agents/open-work.md`).

## Migrating an anonymous session to signed-in

Just the ownership pivot — no content moves anymore:

1. **Content** (chat_sessions and its children) is already DB-
   resident from day one. `rekeyAnonymousChatSessions` runs a
   single UPDATE on `chat_sessions` flipping `ownerAnonId →
   ownerUserId`. Child rows inherit transitively.
2. **Telemetry** (intent_log, viewer_events, gate_event,
   page_usage_event) — already in DB tagged with `anon_user_id`,
   gets `UPDATE … SET groundx_username = ?` on the matching rows
   (separate from chat_sessions; happens in the auth flow that
   creates the user, not in the claim endpoint).

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
