# workspace-groundx-v2-ui — capabilities.md

> **Purpose.** Ground-truth, code-verified *execution* layer for local-phase agents
> (OpenSpec drafting + TDD). Every claim below was read from source in this commit.
> **Scope boundary (no duplication — read this).** This repo is already deeply documented:
> `AGENTS.md` is a hub into **27 `docs/agents/` spokes** (architecture, data-model,
> widget-contract, chat-session-model, testing, deploy, observability, citation philosophy,
> template-scope-results, gotchas, …), plus a detailed `ARCHITECTURE_NOTES.md`, a rich
> `service.yaml`, and an active `openspec/`. Those own the **architecture, chat data-flow,
> TurnRunner/streaming internals, RAG/citation pipeline, widget contract, provider stack,
> two-mode model, and Template/Scope/Results lifecycle** — this file does NOT restate any of
> them. It captures only the lower-level middleware/route/env/DB/boot/CI mechanics those docs
> summarize but don't pin to exact, runnable coordinates. When this file and a spoke overlap,
> the spoke is canonical for *concepts*; this file is canonical for *exact wiring*.

---

## 1. HTTP route table (`middleware/src/app.ts`, verified)

Flat inventory of every registered route with its method, auth guard, and rate-limiter. This
table exists nowhere else in the docs. Guards: **`requireSession`** = any session (anon cookie
OR authed); **`requireAuthenticatedUser`** = signed-in only; **none** = open. Limiters:
`authLimiter` (on `/api/auth/*`), `apiLimiter` (general), `llmLimiter` (`/api/llm`).

| Method | Path | Guard | Limiter |
| --- | --- | --- | --- |
| GET | `/api/healthz` | none | none |
| GET | `/api/csrf/token` | none | none |
| GET | `/api/metrics` | none (gated on `METRICS_ENABLED`) | none |
| POST | `/api/auth/register` | none | authLimiter |
| POST | `/api/auth/login` | none | authLimiter |
| POST | `/api/auth/logout` | requireSession | authLimiter |
| POST | `/api/auth/reset` | none | authLimiter |
| GET | `/api/auth/me` | requireAuthenticatedUser | authLimiter |
| PATCH | `/api/me/metadata` | requireAuthenticatedUser | authLimiter |
| POST | `/api/auth/password/reset` | none | authLimiter |
| POST | `/api/auth/password/confirm` | none | authLimiter |
| POST | `/api/onboarding/session` | none | apiLimiter |
| POST | `/api/chat-sessions` | requireSession | apiLimiter |
| POST | `/api/chat-sessions/claim` | requireAuthenticatedUser | apiLimiter |
| GET | `/api/chat-sessions` | requireAuthenticatedUser | apiLimiter |
| POST | `/api/viewer-events` | requireSession | apiLimiter |
| POST | `/api/intent` | requireSession | apiLimiter |
| POST | `/api/templates` | requireAuthenticatedUser | apiLimiter |
| POST | `/api/extract-field` | requireSession | apiLimiter |
| POST | `/api/widgets/smart-report/reports/render` | requireSession | apiLimiter |
| POST | `/api/widgets/smart-report/reports` | requireAuthenticatedUser | apiLimiter |
| POST | `/api/chat/messages` | requireSession | apiLimiter |
| GET | `/api/scenarios` | none | apiLimiter |
| POST | `/api/projects` | requireAuthenticatedUser | apiLimiter |
| (mounted) | `/api/llm` (`app.use`) | requireSession | llmLimiter |

**Authorization beyond the guard:** mutating chat-session routes additionally call
`assertChatSessionOwnership` (the IDOR seam — authed→ownerUserId, anon→cookie ownerAnonId);
server-derived role/RBAC is never trusted from the client. (Mechanism detailed in the
chat-session-model spoke; noted here only so the route table isn't read as the whole auth story.)

---

## 2. Middleware stack order (load-bearing)

The order `createApp` registers global middleware — order is a correctness property (CSRF must
read cookies the cookie-parser populated; session must precede CSRF and rate-limit). Verified
sequence:

```
helmet({ contentSecurityPolicy … })        → metrics-capture gate (always; /metrics endpoint gated on METRICS_ENABLED)
→ pinoHttp (request logging)               → cors({ origin: prod? ALLOWED_ORIGIN : true, credentials:true })
→ express.json({ limit: "25mb" })          → express.urlencoded({ extended:true })
→ cookieParser()                           → sessionMiddleware(env, repository)
→ csrfMiddleware(env)                       → rate-limit buckets (auth/api/llm)
```

**CSRF model** (`middleware/csrf.ts`): double-submit cookie. Server sets `csrf_token` cookie
(JS-readable), client echoes it in the `x-csrf-token` header, server compares. Safe methods
`{GET, HEAD, OPTIONS}` skip. **Exempt POST paths** (kept deliberately minimal — each is attack
surface): `/api/onboarding/session`, `/api/auth/login`, `/api/auth/register`, `/api/auth/reset`.
Toggle via `CSRF_ENABLED` (default true; tests flip false). **Rate-limit keying:**
`sessionAwareKey` = `req.session?.id ?? req.ip` — so auth endpoints (no session yet) fall back
to IP. Tunable per-deploy via `RATE_LIMIT_{AUTH,API,LLM}_PER_MIN`.

---

## 3. Env-var contract (`middleware/src/config/env.ts`, Zod)

The full runtime config surface — every key, its default, and what's **required in production**
(enforced by `superRefine`, which fails the boot). Precedence: real env > `.env.local` > `.env`
(skipped entirely when `NODE_ENV=test`).

**Required in EVERY environment (fail-fast):** `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`,
`MYSQL_PASSWORD` — MySQL is the only runtime repository; a boot without a DB fails rather than
storing chat in RAM (the in-memory repo is a test-only injected double; `APP_REPOSITORY_MODE`
was retired 2026-06-11).

**Required in production only (`superRefine`):** `SESSION_SECRET` (must be ≠ the dev default,
≥32 chars), `GROUNDX_PARTNER_API_KEY`, `LLM_API_KEY`, `LLM_SERVICE`, `LLM_MODEL_ID`,
`EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL_ID` (citation-verification is always-on; the embeddings
API *key* is optional everywhere — keyless self-hosted providers are first-class).

**Key tunables (with defaults):** `PORT` 3001 · `UPSTREAM_TIMEOUT_MS` 30000 (1k–120k) ·
`GROUNDX_BASE_URL` `https://api.groundx.ai/api/v1` · `LLM_CONTEXT_WINDOW_TOKENS` 16000 (prod
MUST match the real model) · `COMPRESSION_TRIGGER_RATIO` 0.7 · `COMPRESSION_TARGET_TOKENS` 1000
· `MAX_ACTIVE_SUMMARIES_BEFORE_META` 10 · `META_COMPACTION_BATCH_SIZE` 5 ·
`MAX_SUMMARY_OUTPUT_TOKENS` 600 · `EMBEDDINGS_VERIFY_THRESHOLD` 0.82 · `EMBEDDINGS_TIMEOUT_MS`
2000 (deliberately tight — citation verify blocks the reply) · `BYO_PAGES_LIMIT` 100 ·
`RATE_LIMIT_{AUTH,API,LLM}_PER_MIN` 20/120/60 · `MYSQL_PORT` 3306.

**Air-gap / on-prem seams (env-overridable hosts):** `GROUNDX_BASE_URL`, `LLM_BASE_URL`,
`LLM_LIGHT_BASE_URL` (separate cheaper model for summarization/compaction; falls back to the
main LLM when unset), `EMBEDDINGS_BASE_URL` (TEI/Ollama/vLLM self-host), `OTEL_EXPORTER_OTLP_
ENDPOINT`. Feature flags: `METRICS_ENABLED` (default true), `SSO_ENABLED`, `CSRF_ENABLED`,
`DISABLE_AGENT_TURN_LOG`. Observability (all optional, off when unset): `POSTHOG_API_KEY`/
`POSTHOG_HOST`, `SENTRY_DSN`, `OTEL_*`.

---

## 4. Boot sequence (`middleware/src/index.ts`)

Top-level `await` module (ESM). Order is verified and intentional:

1. `loadEnv()` — Zod parse + `superRefine`; **fail-fast** before anything connects.
2. `await initTelemetry(env)` (OTel).
3. `new MySqlAppRepository(env)` → **`await repository.createSchema()`** (see §5).
4. Conditional seeds: `seedSampleProject` (only if `GROUNDX_SAMPLES_BUCKET_ID` set — it hits
   GroundX); `seedSampleReportTemplate` (always; pure DB upsert, idempotent).
5. Build clients conditionally: `lightLlmClient` only if `isLightLlmConfigured`; `quoteEmbedder`
   only if `isEmbeddingsConfigured` (else logs a loud warning — citation verify degrades to
   lexical-only; never silent).
6. `createApp({...})` with **real** clients (no mock mode), then `app.listen(env.PORT)`.
7. On boot it logs `summarizeEnvForLog` — recognized keys with values, but anything matching
   `/KEY|TOKEN|SECRET|PASSWORD/i` shows only `present`/`absent` (kubectl-logs-safe).
8. `SIGINT`/`SIGTERM` → `shutdownTelemetry` → `server.close` → 10s force-exit fallback.

---

## 5. Persistence mechanism (`middleware/src/db/mysqlRepository.ts`)

Execution detail behind the table list in `service.yaml` (which already names the tables —
not repeated here as a data dictionary). What matters for changes:

- **`mysql2` pool**, `connectionLimit: 10`, `waitForConnections: true`.
- **Schema is applied at boot by `createSchema()`** as a sequence of **`CREATE TABLE IF NOT
  EXISTS`** statements — **12 tables created** (`sessions`, `app_user_metadata`,
  `chat_sessions`, `chat_messages`, `chat_turn_index`, `conversation_summaries`,
  `chat_session_entities`, `viewer_events`, `intent_log`, `templates`, `projects`,
  `project_grants`).
- **Deliberately ZERO migrations.** The code issues **no `ALTER` and no `information_schema`
  inspection** — an explicit design choice (commented in source): a fresh DB and an
  already-provisioned one both converge via `CREATE IF NOT EXISTS`. Schema changes that need to
  alter an existing column are therefore **not** handled by this boot path — that's a manual /
  out-of-band operation. (Retired tables are removed via `DROP TABLE IF EXISTS` — currently
  `extraction_schemas`.) **This is the answer to "how are migrations done": they aren't, by
  design — additive CREATE-only at boot.**
- **Two implementations behind one `AppRepository` interface:** `MySqlAppRepository` (runtime)
  and `MemoryAppRepository` (tests only, injected at the seam). Round-trip drift is guarded by
  `persistedColumnPolicy.test.ts` (every persisted column must have a read site).

---

## 6. DI seam (the test/extension boundary)

`createApp` takes all upstream dependencies as injected parameters — the single seam where tests
swap fakes and where a new external client is wired. Exact signature (verified):

```
createApp({ env, repository, partnerClient, groundxClient, llmClient,
            lightLlmClient, quoteEmbedder, embedThreshold, scenarioRegistry })
```

There is **no mock mode** (retired 2026-06-01): the runtime always constructs real `Fetch*`
clients in `index.ts`; tests inject fakes here instead. Adding an upstream means adding a
parameter here + a fake in the test fakes module — never an inline import at a call site.

---

## 7. Dev / test / CI mechanics

**Monorepo:** npm workspaces — `shared` · `app` · `middleware`. Node `>=20` engine; CI runs on
Node 22. `@groundx/shared` must be built before app/middleware (the dev/build/test scripts all
prefix `npm --workspace @groundx/shared run build`).

**Commands (root `package.json`, verified):**
- `npm run dev` — concurrently boots middleware (tsx watch, :3001) + app (Vite, :5173); the
  Vite dev server proxies `/api` → `http://localhost:3001`.
- `npm test` — shared build → `test:alias` → `test:setup-env` → `test:deploy` → app tests →
  middleware tests.
- `npm run verify:preview` (== `smoke:dev`) — boots both servers and drives a real `/api` flow
  (onboarding session, login, an authed read, a CSRF-protected POST).
- `npm run test:e2e` — Playwright (app workspace).
- `npm run scan:secrets` — committed-secret scan.

**Net-new app-side pre-test gates** (run before vitest via `app` `test` script; not described in
the spokes): `check-tool-references.mjs` (every JSX `tool="…"` literal must resolve to a declared
widget tool; Levenshtein "did you mean?" on near-misses) and `check-tool-quality.mjs`
(author-side tool-declaration quality — naming, description, `.describe()` on Zod fields).

**CI (`.github/workflows/ci.yml`), two jobs:**
- `scaffold` — runs under the **`dev` GitHub environment** to resolve the env-scoped
  `GROUNDX_PARTNER_API_KEY`. Steps: `npm ci` → validate-env-contract → secret scan → build →
  `npm test` → dev smoke → Playwright. **The e2e suite boots against REAL GroundX (no mock
  mode) and fails LOUDLY if `GROUNDX_PARTNER_API_KEY` is absent** — it must never pass "quietly
  green." Deterministic fixture: seeded sample doc `c3bfff49` in bucket `28454`.
- `container-images` — builds both Dockerfiles and, crucially, **runs the middleware image to
  assert `@groundx/shared` actually resolves** in the multi-stage `npm ci --omit=dev` runtime
  (catches workspace-wiring regressions the unit suite can't see).

Other workflows present: `deploy.yml`, `diagnose.yml`, `uninstall.yml`, `alb-alarms.yml`
(Helm/EKS/ALB ops — covered by the deploy spoke).

---

## Gaps (call before assuming)

- **Root `package.json` `name` is still `groundx-web-ui-scaffold`** and `ARCHITECTURE_NOTES.md`
  self-identifies with the scaffold's name/branch — `service.yaml` flags this unresolved:
  confirm whether this repo is a managed **instance cloned from** the scaffold or a **v2 line
  of** it. Affects role/edge-direction in `repos.yml` and whether scaffold changes propagate.
- **Migration story is CREATE-only by design (§5)** — any change requiring an `ALTER` to an
  existing production column has no in-repo path; confirm the out-of-band process with whoever
  owns the DB before shipping such a change.
- `service.yaml` itself is a **handoff DRAFT** with several `VERIFY` markers (role enum,
  `repo_url`, clone direction) — don't treat its unverified fields as settled.
- Frontend (`app/`) internals — provider order, the conversation engine, widgets — are
  intentionally out of scope here; they're documented in the spokes but not re-verified in this
  file.
