# Frontend API dependency injection — foundation + complete phased roadmap

## Why

The frontend network surface — the `api` singleton in `src/api/index.ts` PLUS a
set of **standalone modules that are NOT in that aggregate** (`@/api/chatSessions`,
`chatSessionPatch`, `chatSessionsList`, `claimAnonymousChat`, `chatSessionEntities`,
`viewerEvents`, `intentLog`, `smartReport`, `extractField`) — is **imported
directly** by components/contexts (92 files import an `@/api/*` submodule; 21
import the `@/api` aggregate). With no injection seam, tests must intercept at the
module boundary with file-scoped `vi.mock`. Measured today: **91 `vi.mock` calls
across 66 files / 30 distinct boundaries**. Of those, **~76 are api/telemetry-owned
and removable** by this effort over its phases (`@/api/axios` ×15, `@/api` ×13,
`@/api/chatSessions` ×10, `@/lib/sentry` ×9, …); the remaining **~15 are
NON-network** (`framer-motion` ×4, context mocks ×7, `PdfViewer`, `appConfig`,
`resetExperience`) and are explicitly OUT of scope — this change does not pretend
to remove them. This is the disease behind two symptoms:

- A 2-line runtime change to a mount-path API fn (#8's `ensureServerChatSession`)
  ripples into every test that renders a component touching it.
- Production redundancy: #8 has TWO session-establish paths with no single-flight
  → the 403 ownership race.

The middleware already solves this with DI: `createApp({ repository, partnerClient,
groundxClient, llmClient, scenarioRegistry })` — one fake set built per `setup()`.
The frontend has no equivalent. This change brings the same discipline to the
frontend, done completely (no per-file-mock band-aids). Tracked by issue #10.

## What Changes (this foundation change)

- **An injected `Api` client.** Define the `Api` interface — which is BROADER than
  today's `api` aggregate: it absorbs the aggregate's members AND the standalone
  session/chat/report/extract modules (`chatSessions`, `chatSessionPatch`,
  `chatSessionsList`, `claimAnonymousChat`, `chatSessionEntities`, `viewerEvents`,
  `intentLog`, `smartReport`, `extractField`) into cohesive grouped members (e.g.
  `session`, `chat`, `viewerEvents`, `report`, `extract`, plus `partner`/`groundx`/
  `auth`). Add an `ApiProvider` and a `useApi()` hook (via the existing
  `createContextHook`, exported from `createEntityContext.tsx:63`). The composition
  root (`App`/`AppInitialization`) wires the REAL client (the aggregate + the
  standalone module fns bound into the grouped shape). The legacy singleton +
  direct module imports stay importable during migration (coexist).
- **One test fake.** A `makeFakeApi(overrides?)` builder (default = every method a
  `vi.fn` resolving a sensible empty/success value) injected ONCE by the render
  harnesses (`renderWithOnboardingProviders` + the steady/scoped harnesses). Tests
  override only what they assert; they stop `vi.mock`-ing network modules.
- **Proof slice — the session/chat domain.** Migrate `OnboardingShell`,
  `OnboardingSessionContext`, the ChatStore write paths, and `chatSessions` /
  `onboardingSessionEntity` consumers to `useApi()`. **Land #8's single-flight on
  the anon-session establish:** today `issueOnboardingSession` is a bare
  `axios.post` with NO dedup, called from two places (`OnboardingShell` + the
  401-retry in `common.ts`) → the ownership race. The new `session.ensureAnonSession()`
  on the injected client is single-flight (one in-flight promise, one
  `POST /api/onboarding/session`); the chat-session create awaits it. (Distinct
  from the EXISTING chat-ensure module-state `awaitChatSessionEnsured` /
  `__markChatSessionEnsured` in `chatSessions.ts`, which moves onto the client as
  part of the migration.) Delete the per-file `@/api` / `@/api/chatSessions` /
  `@/api/entities/onboardingSessionEntity` mocks in that domain's tests (they use
  the harness fake). This proves the seam end to end AND closes #8 correctly (no
  401/403/404), with no test ripple.
- **Drift guard.** A test that FAILS if (a) a migrated component/context imports a
  network module directly instead of `useApi()`, or (b) a test re-`vi.mock`s a
  migrated network boundary. Scoped to migrated domains; widened per phase.
  Allowlist = the composition root + the client implementation **+ the
  client/entity-module unit tests** (which legitimately `vi.mock("@/api/axios")`
  to test the real client — e.g. the 15 `@/api/axios` mocks are largely these and
  must NOT be flagged).

## Complete phased roadmap (each a follow-on OpenSpec change, created when picked up)

This change ships the foundation + the session/chat slice. The remaining work to
**fully** eliminate the per-file mocks (issue #10), in order:

1. **Foundation + session/chat** ← THIS change (proves seam, closes #8).
2. **auth domain** — `AuthProvider`/customer entity → `useApi()`; delete `@/api`
   mocks in auth tests.
3. **groundx resources** — buckets / documents / workflows / groups providers.
4. **scenario-registry + canvas-orchestrator**.
5. **smart-report + extract** — `smartReport`, `extractField`, report builder.
6. **telemetry/observability** — `sentry`/`ga`/`analytics` injected via the same
   client (or an `Observability` member); kills the 9+2+2 telemetry mocks.
7. **Cleanup** — remove the singleton direct-import path entirely; widen the drift
   guard repo-wide (no `@/api` import outside the composition root + the client
   impl; no per-file network `vi.mock`).

Each phase is independently shippable, deletes its domain's mocks, and tightens
the guard — composable, never a big-bang.

## Impact

- New: `src/contexts/ApiContext/` (interface, provider, `useApi`), a fake builder
  in `src/test/`, the drift-guard test.
- Migrated (this change): the session/chat-domain consumers + their tests; #8's
  single-flight.
- Specs: `app-architecture` (ADDED — injected Api client) + `testing-suite`
  (ADDED — one injected fake, no per-file network mocks, guard).
- No user-visible behavior change EXCEPT #8 (chat bootstrap no longer 401/404/403s).
- Out of scope here: the per-domain migrations (2–7 above) — separate changes.
