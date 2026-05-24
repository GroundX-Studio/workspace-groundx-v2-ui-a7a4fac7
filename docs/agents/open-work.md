# Open Work + Deferred Tracks

What's pending, in priority order. Each has a brief "why deferred"
note so you can decide whether to pick it up.

## High-impact, multi-week — needs roadmap planning before starting

### Live GroundX search + LLM wiring (Track F, task #70)

`middleware/src/services/chatRouter.ts` exists as a scaffold:
three-mode classifier (rag / structured / hybrid), MOCK_MODE
responses for the chat surface to boot today. Live mode throws
"not yet wired."

What's needed to finish:
- Real GroundX search via `FetchGroundXClient` with the active
  scenario's bucket id. Assemble grounded prompts with citations.
- LLM provider abstraction beyond OpenAI-compatible (Claude
  native API, self-hosted via base URL with custom auth header).
- Token budget counter (tiktoken-compatible or provider-specific)
  → compression trigger (see § next).
- Tool-call recovery for canvas dispatch tools per
  `project_architecture.md`.
- Per-scenario MOCK_MODE fixtures so canned responses thread
  Utility / Loan / Solar specifics correctly.
- Express endpoint wiring (POST `/api/chat/messages`) + client
  SDK.
- Stream support (SSE / fetch-stream) so the chat surface can
  render tokens as they arrive.

Why deferred: requires LLM provider credentials live + careful
error budget design + tool-call validation pipeline. Multi-week
scope.

### Compression chain + LLM bundling (Phases I + J, task #73)

`middleware/src/services/contextBundler.ts` exists:
`bundleChatContext()`, `shouldCompress()`, `planCompression()` are
pure functions, tested.

What's needed to finish:
- The actual LLM call that generates summary content for an
  identified compression range (depends on live LLM router from
  #70).
- DB writer that creates the `conversation_summary` row +
  flips `chat_messages.compressed_into_summary_id` for absorbed
  messages.
- Integration loop in the chat router that summarizes → re-bundles
  → checks token budget → retries if still over.
- Provider-specific tokenizer integration to replace the
  chars/4 heuristic.

Why deferred: gated by #70.

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

### Per-scenario chat input handler

Right now the F2 chat input is a visual stub. Wiring it to the
LLM router lands with #70.

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
