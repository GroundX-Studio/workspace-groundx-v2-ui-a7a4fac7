# Open Work + Deferred Tracks

What's pending, in priority order. Each has a brief "why deferred"
note so you can decide whether to pick it up.

## Chat stack — prioritized fix list (locked 2026-05-25; P0s closed PM 2026-05-25)

Consolidated from the architecture review + a follow-up working
session that surfaced design defects in the original implementation.

### Recently closed (PM 2026-05-25)

1. **P0 #1: Compression chain redesign** — DONE. `runCompression`
   no longer splices prior summary text into leaf LLM calls; every
   leaf summary is written with `generation = 0` and
   `absorbedSummaryIdsJson = "[]"`. New `runMetaCompaction` folds
   the oldest active summaries into a super-summary when the
   active count exceeds `MAX_ACTIVE_SUMMARIES_BEFORE_META = 10`
   (folds the oldest 5 into 1). New `selectActiveSummaries` filter
   excludes summaries listed in any other summary's
   `absorbedSummaryIdsJson` from the bundle. `BundleConversationInput`
   now carries `activeSummaries: []` (was `latestSummary: …|null`);
   the bundler's token estimate walks all active summaries. 20
   tests cover the new compressor + 10 cover the bundler.

2. **P0 #2: ContentScope routing in `searchGroundX`** — DONE.
   `searchGroundX` is now exported and takes a `RagContentScope`
   discriminated union with 4 live cases + 1 "unknown" fallback
   that logs:
     - `bucket` (no projectIds)   → `POST /v1/search/{bucketId}`
     - `bucket` (1 projectId)     → `+ filter: { projectId: P }`
     - `bucket` (N projectIds)    → `+ filter: { projectId: { $in: [...] } }`
     - `group`                     → `POST /v1/search/{groupId}`
     - `documents`                 → `POST /v1/search/documents + documentIds`
     - `unknown`                   → legacy /v1/search/documents + console.warn
   `deriveRagContentScope` lives in `chatHandler.ts` as the single
   seam where future scope refinements land. Today it returns
   `{kind: "bucket", bucketId: env.GROUNDX_SAMPLES_BUCKET_ID}` —
   `EntitySession` doesn't yet carry project/group/doc refs.
   See **follow-on** below.

3. **P0 #3 + #4: Live `structured` + `hybrid` modes** — DONE
   (framework + minimum-viable handlers). New
   `services/structuredHandler.ts` ships `classifyStructuredQuery`
   (7 sub-kinds) + `runStructuredQuery` (dispatches by sub-kind)
   + `runHybridQuery` (folds RAG snippets + entity context into a
   tour-style answer).
   Sub-handlers wired with REAL data: `pages_remaining`,
   `onboarding_state`, `current_entity` (these read chat_sessions
   + chat_session_entities, which exist).
   Sub-handlers that need readers not yet built (`saved_schemas`,
   `my_projects`, `api_keys`) return a frank "I can answer once
   the data readers are wired" reply instead of 501-ing the whole
   request OR fabricating an answer. Same honesty principle as
   the silent-mock fix earlier.
   `routeChat` no longer throws `ChatRouteNotImplementedError`
   for structured/hybrid when `repository + chatSessionId` are
   supplied (they always are from chatHandler). The 501 path
   remains for misconfigured callers.

### P0 follow-ons (smaller scope, real work)

1a. **`runMetaCompaction` chained-generation evolution.** Today the
    handler triggers meta-compaction on `activeSummaries.length > 10`
    + folds the oldest 5. Eventually super-summaries themselves
    pile up; we'd want a 2nd-tier trigger (e.g. > 10 supers fold to
    1 mega-super, gen=2). Test the actual session-lifetime curve
    before tuning — the constants are easy to bump.

2a. **`EntitySession` scope refs.** `deriveRagContentScope` in
    chatHandler returns `{kind:"bucket", bucketId: env.SAMPLES}`
    today. When EntitySession gains optional `projectIds[]` /
    `groupId` / `documentIds[]` fields, the helper switches on
    those automatically — single point of change. Also need:
    helper that ensures-creates a group of buckets when the user
    is looking across N workspaces.

3a. **Real `saved_schemas`, `my_projects`, `api_keys` readers.**
    Today these sub-kinds return a frank "not wired yet" reply.
    Once the underlying tables / Partner reads exist, swap the
    body of `answerUnimplementedSubkind` for real queries. The
    dispatch + classify + envelope shape don't change.

### P1 — quality / UX

5. **Per-status client error mapping**
   `app/src/api/chatSessions.ts:sendChatMessage` only branches
   on 404 today (invalidates the ensure cache). Everything else
   re-throws to F5's generic "couldn't reach the chat service"
   handler. Need:
   - 401 → re-auth flow (anon bootstrap OR redirect to login).
   - 501 → user-facing "I can't answer that kind of question yet."
   - 504 → "took too long — retry?" with one auto-retry.
   - 502 / other 5xx → "something went wrong — retry in a moment."
   - 400 → developer-visible error (this is a programming bug).

6. **Iterate on the grounded completion prompt**
   Current system prompt in `callGroundedLlm` is naïve: "Answer
   ONLY using the snippets … Cite by repeating short phrases
   verbatim. Be concise." Needs:
   - Token-budget guard in the prompt (LLM should plan its
     answer length against snippet count + length).
   - Structured citation field (rather than "repeat short
     phrases" — which the LLM does inconsistently).
   - "I don't know" calibration (when snippets don't contain
     the answer, the LLM should refuse rather than hedge).
   - An eval set with at least 20 (query, expected-citation,
     expected-refusal-or-answer) cases per scenario.
   Open-ended; iterate against telemetry once live.

7. **Viewer intent inference with confidence gate**
   The grounded LLM call should optionally output a suggested
   canvas-intent change ("user asked to see source of $X →
   suggest opening F4 with citation_id=$Y"). Surface as a
   suggestedActions chip, NEVER auto-navigate. Required:
   - System-prompt addition asking for an optional
     `suggestedIntent` field with a confidence in [0,1].
   - Reply schema extension:
     `reply.suggestedIntent?: {intent, confidence, reason}`.
   - Dispatch: emit a chip ONLY when `confidence >= 0.85`.
     User opt-in via click. The 0.85 threshold is a guard
     against disrupting the user's current view on a
     low-confidence guess.

8. **Per-scenario MOCK_MODE fixtures**
   `mockResponseFor` returns one canned envelope per mode
   regardless of which scenario the user is on. Utility / Loan /
   Solar should feel distinct in dev and demo.

### P2 — scale / architecture

9. **Compression off the request hot path** — background job +
   202/poll endpoint OR a "compression pending" flag on the
   session. Today P99 latency adds the summarization LLM
   round-trip when compression fires (5-15s). Needs job-runner
   infra not in the scaffold yet.

10. **Streaming response (SSE / fetch-stream)** — today's
    response is a single JSON envelope; F5 waits for the full
    answer. Streaming would render tokens as they arrive.

11. **Tool-call wiring in routeChat** — `reply.tools` always
    `[]` today. Canvas dispatch tools (`show_understand`,
    `show_extraction`, `pin_to_report`, `propose_schema_field`,
    `propose_report_section`, `search_groundx`) need to flow
    from the grounded LLM call through chatHandler into
    `suggestedActions` / direct dispatch.

### P3 — observability / scale follow-ups

12. **Frontend Sentry browser SDK + claim-failure telemetry**
    (existing item — `GateView` claim-fail logs to console only).

13. **DB connection pool sizing + batch reads in chatHandler**
    (existing item — pool=10 with ~5-8 sequential reads per
    chat post).


## Recently closed (2026-05-25)

### Live GroundX search + LLM wiring (Track F, task #70) — DONE

`POST /api/chat/messages` is live. `chatHandler.handleChatMessage`
validates, persists the user message, builds the 3-axis bundle,
runs the compression pre-flight, calls `routeChat` (mock or live
RAG), and persists the assistant reply. The RAG path hits
`searchGroundX` → `callGroundedLlm` against `FetchGroundXClient`
and `FetchLlmClient`. F5 InteractView is wired through
`app/src/api/chatSessions.ts:sendChatMessage`.

Still pending under this track (smaller scope):
- Per-scenario MOCK_MODE fixtures (Utility / Loan / Solar
  specifics in the canned envelope — today's mock is generic).
- Live `structured` + `hybrid` paths (need MySQL + Partner
  readers that aren't wired yet — chatRouter throws
  `ChatRouteNotImplementedError` → 501 outside MOCK_MODE).
- Streaming response (SSE / fetch-stream).
- Tool-call recovery for canvas dispatch tools.

### Compression chain (Phases I + J, task #73) — DONE

`conversationCompressor.ts` ships `buildSummaryPrompt`,
`summarizeChunk` (the LLM call with temperature 0.1 + role-stamped
chunks + prior summary splicing), and `runCompression`
(orchestrator that fetches absorbed messages, calls the LLM,
writes the `conversation_summaries` row, marks messages
compressed via `markChatMessagesCompressed`).

Still pending: move compression off the request hot path
(currently runs synchronously inside chatHandler when
`shouldCompress` fires) — see "Compression background job" below.

### F6 gate wired to real register + claim — DONE

`GateView.tsx` now collects first / last / email / password /
confirm and calls `register()` → `claimAnonymousChat()` →
`promoteToSignedIn()` → `commitGate("register")`. The magic-link
stub copy is gone. e2e covers the happy path + register-failure.

## High-impact, multi-week — needs roadmap planning before starting

### Compression background job

`runCompression` currently runs in the chatHandler request thread.
When it fires, P99 latency for `POST /api/chat/messages` adds the
LLM summarization round-trip (5–15s typical). At scale this
contends with the DB connection pool and produces user-visible
hiccups.

What's needed:
- A job queue (BullMQ / SQS / similar) the middleware can enqueue
  compression work onto.
- Background worker process (separate container or in-process
  worker pool with capped concurrency).
- A 202 + polling endpoint OR a "compression pending" flag on
  the session so the next chat post knows whether the previous
  one's compression is still running.
- Retry semantics: if the worker dies mid-write, the absorbed
  messages must NOT get prematurely marked compressed.

Why deferred: needs job-runner infra that isn't in the scaffold
today.

## Medium — tractable when prioritized

### MySQL primary in production

The schema + repo impls + BFF claim endpoint are all in place. To
switch on:

1. Provision MySQL (RDS or self-hosted).
2. `deploy_config` with `APP_REPOSITORY_MODE=mysql` +
   `MYSQL_HOST` + `MYSQL_PORT` + `MYSQL_DATABASE` + `MYSQL_USER`
   variables + `MYSQL_PASSWORD` secret.
3. First deploy runs `createSchema()` which executes the
   CREATE TABLE statements.
4. Verify with `kubectl exec <middleware-pod> -- printenv` +
   the recognized-env startup log line.

Holding off until we're past the in-memory-fast-iteration phase.

### Steady-mode UI

The route + shell skeleton exist (`/c/:sessionId` →
`SteadyShell`). The `SessionSwitcher` component renders the
session list + new-session button. What's missing:

- The actual chat + canvas UI inside the SteadyShell (currently
  a placeholder with the SessionSwitcher mounted).
- Session list fetch from the BFF when the URL session id
  isn't in local storage (hint the user with the
  "unknown-session" message until that fetch lands).
- Multi-session keyboard shortcuts (cmd-K to switch, etc.).

The right time to do this is after F3/F5/F6/F7 polish on the
onboarding side feels done — steady mode is the post-onboarding
surface, and product priorities aren't there yet.

### Real Phase-0 observability dashboards

The middleware emits OTel traces + prom metrics + PostHog
events + Sentry errors. What's NOT done:

- Pre-canned dashboards on AWS Managed Prometheus / AWS X-Ray.
- PostHog funnels + cohorts configured server-side.
- Sentry source-map upload on production builds.
- Alert rules (SLO violations, error budget burn).

These are ops-y configurations, not code. Land when the project
has live traffic to look at.

### CSRF middleware

`POST /api/auth/register`, `POST /api/auth/login`, and
`POST /api/chat/messages` are protected only by SameSite=lax
cookie semantics. That covers most cases but not all (cross-site
form submissions targeting a known origin). Lands when the app
needs to ship publicly:

- CSRF token endpoint (`GET /api/csrf-token`).
- Middleware checking header / body token on state-changing
  routes.
- Frontend axios interceptor adding the token to outgoing
  POST/PATCH/DELETE.

Why deferred: state-changing routes are session-cookie-gated
today; CSRF is a defense-in-depth layer for the public-launch
phase.

### F4 SchemaView (chat-driven schema builder)

The W7 Extract widget on the canvas. Biggest unstarted product
surface. Needs: schema-builder canvas widget, intent dispatch
from chat ("add field X" / "remove field Y"), live extraction
preview, save-template flow. Multi-day.

## Medium — tractable when prioritized

### Sentry browser SDK + claim-failure telemetry

`GateView.handleRegisterSubmit` wraps `claimAnonymousChat()` in
try/catch and logs to `console.error`. If the claim fails on
every sign-up, we'd never know without watching the BFF logs.
The middleware side has Sentry; the frontend doesn't.

Lands with the wider observability hardening track. For now,
treat any sign-up flow regression as user-reported only.

### Engineer-call Calendly wire-up

`GateView.handleBookCall` calls `commitGate("engineer-call")`
without actually opening a Calendly widget. Stub copy is in
place. Needs:

- `CALENDLY_URL` env var passed to the frontend (Vite envs).
- `<a href={CALENDLY_URL} target="_blank">` OR Calendly's
  inline embed widget.
- `gate_event` row for analytics on call-booking conversion.

### DB connection pool sizing + batch reads

`chatHandler.handleChatMessage` makes 5–8 sequential DB calls
per chat post (read session, messages, summaries, entities,
viewer events, append user msg, append assistant msg). With
`connectionLimit: 10` in the MySQL pool, 10 concurrent chat
posts can starve the pool. Future:

- Bump `connectionLimit` to 50+ with monitoring.
- Batch reads into a single `SELECT … UNION ALL …` query per
  chatHandler call.

Why deferred: not biting until real load arrives.

## Small + isolated — pick up anytime

### F5 InteractView polish

Stub-ish today. The wireframe shape: chat-with-sources widget
anatomy (citation chips inline with bot turns; clicking a chip
opens a side panel showing the source page). Manifest provides
`sampleChatScript` for the canned exchange.

### F7 IntegrateView polish

Has the cURL / Python / TypeScript snippet tabs + the
agent-plugins panel. The plugin "Download" buttons are
non-functional. Memory note: this is distinct from the in-app
plugin loader (which is a separate workstream).

### F3a edit-schema branch

Stub. The wireframe shows an inline schema editor. Real
implementation would mount the schema-builder widget pattern.

### Richer thinking-note formatting

Today the scenario manifest's `thinkingScript` is `string[]` —
plain strings. The wireframe shows some words bolded inside
each note. Could extend the manifest field shape to support
inline formatting OR parse markdown-lite at render time.

### F2 chat input wire-up

F5 InteractView is wired to the live chat endpoint
(`sendChatMessage`). The F2 chat input (`ChatInputStub` near
the bottom of `OnboardingChatColumn.tsx`) is still a visual
stub — it doesn't dispatch anywhere. The wiring pattern from F5
should drop in cleanly; just reuse `sendChatMessage` with the
active chatSessionId. Probably 30 minutes of work.

### Knex migrations

Current `createSchema()` runs CREATE TABLE IF NOT EXISTS
statements inline. Productionizing: convert to versioned
migrations under `middleware/src/db/migrations/`. Helm
pre-install/pre-upgrade Job runs them. Deferred until we need
schema EVOLUTION (today's deploys are first-table-create only).

## Known minor bugs

- The Pick-a-view pill labels use `category.name.toLowerCase()`,
  which can produce awkward labels for multi-word categories
  ("loan applicant" → fine; "credit history" → fine; but the
  styling is "pill" not "sentence-case"; matches wireframe but
  worth flagging if a scenario has a long category name).
- The OnboardingNav chevron toggle uses `«` / `»` Unicode
  characters rather than an MUI icon. Acceptable; an MUI chevron
  icon would render slightly nicer.
- The "unknown session" hint in SteadyShell uses an inline
  `<code>` element with no MUI wrapper; OK as a placeholder.

## Where to add the next "open work" entry

If you discover something deferred while doing other work, add it
here with a brief "why deferred" or "what's blocking" note. Don't
let pending work hide in code comments.
