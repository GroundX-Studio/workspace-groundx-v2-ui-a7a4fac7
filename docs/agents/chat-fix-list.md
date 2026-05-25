# Chat-stack fix list

**The single source of truth for chat-stack pending work.**

Ledger started 2026-05-25 after the working-session pattern of
"close the seam, leave the implementation as TODO" became visible.
Every item here has a `CF-N` id. Inline `TODO(CF-N)` comments in
source reference an entry below. **When an item closes, the inline
TODO gets DELETED.** No drift between code and ledger.

## Rules of engagement

1. **Definition of done = user-visible test.** "Seam in place + unit
   test against the seam" is `in-progress`, not `closed`. Closure
   requires a test that exercises the behavior a real user would
   see (typically a `supertest` against `POST /api/chat/messages`
   with a real-shaped request asserting the right answer).
2. **Max 3 items `in-progress` at once.** Before opening a 4th,
   either close one to genuinely done OR move it back to
   `not-started`. Prevents the backlog growing under the
   appearance of progress.
3. **Closure requires a deliberate decision.** If a sub-handler
   returns "needs reader" today, that's `in-progress` with a
   note. Marking it closed means a real reader is wired AND
   the answer passes an integration test for a known query.
4. **Honest commit titles.** Replace "X done" with "X: seam +
   3 of 7 sub-cases wired (CF-12 pending)". A git log reader
   should be able to tell what's actually shippable.

## Status legend

- **not-started** — design known, no code or partial code only
- **in-progress** — code wired at the seam OR for some sub-cases;
  pending sub-cases / data readers / user-visible test
- **blocked** — waiting on external (data table, env var,
  product decision)
- **closed** — user-visible test passes; inline TODOs deleted;
  no half-implementations

---

## Items

### CF-01 · Compression chain (leaf + meta-compaction) — **closed**
Leaf path no longer splices prior summary; `runMetaCompaction` folds
oldest active summaries when count > 10. `selectActiveSummaries`
filters the absorbed set. Inline TODO in `conversationCompressor.ts`
was deleted. Tested end-to-end via `chatHandler.test.ts`.

### CF-02 · ContentScope routing in `searchGroundX` — **in-progress**
The 5-case scope dispatch (bucket no-filter / bucket-1-project /
bucket-N-projects / group / documents) lives in
`chatRouter.ts:searchGroundX`. The seam is in place + tested.
**Pending to close:** `deriveRagContentScope` in `chatHandler.ts`
ignores `_activeEntity` and only returns the env samples-bucket
fallback. No production caller produces project/group/document
scopes yet — every live request searches the samples bucket.
The seam routes correctly when given a real scope; the seam is
not being given one.
**To close:** `EntitySession` gains optional `bucketId? /
projectIds?[] / groupId? / documentIds?[]`. `deriveRagContentScope`
reads those fields. Test: post a chat message with an entity that
has `projectIds: ["P1"]` and assert the search call body includes
`filter: {projectId: "P1"}`.

### CF-03 · Generic `filter` field on RAG scope (RBAC + org) — **not-started**
Today `searchGroundX` only knows how to build a `projectId` filter
inside `kind: "bucket"`. The GroundX API's `filter` is a generic
Mongo-style query over document metadata; project filter is just
one application. RBAC (which docs is this user allowed to see) and
org-level filters MUST land before steady-mode chat is real.
**To close:** `RagContentScope` types gain an optional
`metadataFilter?: Record<string, unknown>`. `chatHandler` exposes
a `rbacFilterForSession(session)` seam that the handler ANDs in
unconditionally before passing to the router. Test: posting from
a session with a fake RBAC seam returns search calls with the
composed `$and: [rbacFilter, scopeFilter]` body.

### CF-04 · Live `structured` mode — **in-progress**
Framework done (classifier + 7 sub-kinds + dispatch). Three sub-
handlers wired with real data: `pages_remaining` (uses env
BYO_PAGES_LIMIT — frank "live usage not wired"), `onboarding_state`,
`current_entity`. Four sub-handlers return frank "needs reader"
replies: `saved_schemas`, `my_projects`, `api_keys`, `unknown`.
**Pending to close:** real readers for the four frank ones.
**To close:** Reader for `saved_schemas` (extraction_schemas table
when it exists) + `my_projects` (Partner API /project list reader)
+ `api_keys` (Partner API /apikey list reader). Each gets a
user-visible test that posts a real query and asserts the answer
contains the real data.

### CF-05 · Live `hybrid` mode — **in-progress**
Same shape as CF-04 — framework done, real readers pending. The
hybrid answer combines RAG snippets with structured context;
quality depends on CF-04 readers being real + CF-06 prompt
iteration.

### CF-06 · Grounded completion prompt iteration — **not-started**
Current prompt: "Answer ONLY using the snippets … cite by
repeating short phrases verbatim. Be concise." Naive. Inline
TODO in `chatRouter.ts:callGroundedLlm`.
**To close:** prompt revision + structured citation field
(JSON output rather than "repeat phrases") + "I don't know"
calibration when snippets don't contain the answer + a per-
scenario eval set of (query, expected-citation, expected-
refusal-or-answer) at least 20 cases. Test: the eval set runs
in CI; regression fails the build.

### CF-07 · Viewer-intent inference with ≥0.85 confidence gate — **not-started**
The grounded LLM call should optionally output
`suggestedIntent: {intent, confidence, reason}` when the
question implies a canvas-view change. Client surfaces as a
suggested-actions chip ONLY when confidence ≥ 0.85; NEVER
auto-navigates. Inline TODO in `chatRouter.ts:callGroundedLlm`.
**To close:** prompt addition + reply schema extension +
dispatch logic + a test that asserts a chip is emitted on
high confidence + suppressed on low.

### CF-08 · Per-status client error mapping — **not-started**
`app/src/api/chatSessions.ts:sendChatMessage` only special-cases
404 (invalidates ensure cache). Other statuses re-throw raw.
Inline TODO in `sendChatMessage`.
**To close:** branch by status — 401 → re-auth flow, 501 →
"can't answer yet" copy, 504 → "took too long — retry" + one
auto-retry, 502/5xx → generic retry-soon, 400 → developer error.
Test: each status produces the right UX in F5 InteractView.

### CF-09 · Per-scenario MOCK_MODE fixtures — **not-started**
`mockResponseFor` returns one canned envelope per mode regardless
of which scenario (Utility / Loan / Solar) is active. Demo
experience identical across scenarios.
**To close:** per-scenario response fixtures keyed on
`currentEntityKey`. Each scenario answers its own canonical
questions. Test: post the canned questions per scenario in
MOCK_MODE and assert the right scenario-specific answer.

### CF-10 · Compression off the request hot path — **not-started**
`runCompression` + `runMetaCompaction` run in the chatHandler
request thread. When they fire, P99 latency adds the LLM
summarization round-trip (5-15s).
**To close:** job queue (BullMQ/SQS/similar) + background
worker + 202 + poll OR a "compression pending" flag on the
session. Test: posting near the threshold returns 200 promptly;
compression completes asynchronously; the next post sees the
new active summary.

### CF-11 · Streaming response (SSE / fetch-stream) — **not-started**
F5 waits for the full LLM answer today. Should stream tokens.
**To close:** server-sent events from `POST /api/chat/messages` +
client-side ReadableStream consumption in `sendChatMessage` +
incremental render in F5. Test: a long answer renders token-by-
token in an e2e spec.

### CF-12 · Tool-call wiring in `routeChat` — **not-started**
`reply.tools` always `[]` today. Canvas dispatch tools
(`show_understand`, `show_extraction`, `pin_to_report`,
`propose_schema_field`, `propose_report_section`,
`search_groundx`) per `project_dev_contracts.md` are unwired.
**To close:** tool schemas registered with the grounded LLM
call; tool-result extraction in routeChat; tools array
populated in the reply. Test: a query that should fire
`show_extraction` produces the tool call in the response.

### CF-13 · Frontend Sentry browser SDK + claim-failure telemetry — **not-started**
`GateView.handleRegisterSubmit` swallows claim failure with
`console.error`. Middleware-side errors are captured; client-
side aren't.
**To close:** Sentry browser SDK init + capture in the catch
blocks of `sendChatMessage` and `claimAnonymousChat`. Test:
unit test verifying `Sentry.captureException` is called on
the error paths.

### CF-14 · DB pool sizing + batch reads in chatHandler — **not-started**
`chatHandler` makes 5-8 sequential reads per chat post against
a pool of 10 connections. At 10 concurrent posts the pool
saturates.
**To close:** bump pool limit to 50+ with monitoring AND/OR
batch the reads into a single query that returns
`{session, messages, summaries, entities, viewerEvents}` in
one round trip. Test: load test asserts P99 stays under 1s
with 50 concurrent chat posts (mock mode).

### CF-15 · `EntitySession` scope refs (multi-bucket / multi-workspace) — **not-started**
The seam this closes is the one in CF-02 — `EntitySession`
needs to carry the scope refs that `deriveRagContentScope`
reads. Plus the multi-workspace path needs an
`ensureBucketGroup(bucketIds[]) → groupId` helper that mints a
GroundX group once and caches the result.
**To close:** schema columns + ensure-group helper + scope
plumbing test.

### CF-16 · Light LLM vs chat LLM split — **not-started**
Today one `llmClient` + `llmModelId` is used for chat
completion, compression summarization, future suggested
prompts, future viewer-intent inference. Heavy model wasted
on small tasks.
**To close:** new env block (`LLM_CHAT_*` / `LLM_LIGHT_*`),
two `FetchLlmClient` instances at boot, `deps.chatLlm` and
`deps.lightLlm` injected separately. Compressor uses light;
RAG grounded call uses chat. Test: assert leaf summarization
hits the light client, RAG hits the chat client.

### CF-17 · Configurable compression tunables — **in-progress**
`LLM_CONTEXT_WINDOW_TOKENS` env added 2026-05-25. Hardcoded
still: `COMPRESSION_TRIGGER_RATIO` (0.7),
`COMPRESSION_TARGET_TOKENS` (1000),
`MAX_ACTIVE_SUMMARIES_BEFORE_META` (10),
`META_COMPACTION_BATCH_SIZE` (5), `MAX_SUMMARY_OUTPUT_TOKENS`
(implicit/provider-default).
**To close:** all five env-configurable, validated by Zod,
threaded through deps. Test: setting each to a non-default
value affects the right behavior.

### CF-18 · F2 chat input wire-up — **not-started**
F5 InteractView is wired to `sendChatMessage`. F2's
`ChatInputStub` is still a visual stub. Pattern is identical.
**To close:** reuse `sendChatMessage` in F2's submit handler.
~30 minutes of work. Test: F2 e2e posts a message and renders
the assistant turn.

---

## How to use this file

- Opening a new chat-stack task: add a new `CF-N` entry,
  status `not-started`.
- Starting work on it: flip status to `in-progress`. Add an
  inline `TODO(CF-N)` at the point of incomplete code if
  applicable.
- Closing: flip to `closed`, write what the user-visible test
  is, DELETE the inline `TODO(CF-N)` comment.
- The `docs/agents/open-work.md` chat section is now a
  one-line pointer at this file. `memory/project_build_status.md`
  references this file rather than duplicating.

## Current `in-progress` count: 3
- CF-02 (ContentScope routing — seam done; entity scope refs pending CF-15)
- CF-04 (Structured mode — 3 of 7 sub-handlers real; 4 frank-reply)
- CF-05 (Hybrid mode — framework done; quality depends on CF-04 + CF-06)
- CF-17 (Compression tunables — 1 of 5 env-wired)

**That's already 4 in-progress, one over the WIP cap. Next move
either closes one to genuine done or accepts that the cap was
aspirational. Honest record over comfortable record.**
