# app-architecture Specification (delta)

## MODIFIED Requirements

### Requirement: Frontend network access SHALL be through an injected Api client

Frontend components, contexts, hooks, widgets, and views SHALL obtain network
operations from an injected `Api` client via `useApi()` (provided by
`ApiProvider`), NOT by importing the `src/api` singleton or its entity modules
directly. Exactly one composition root SHALL wire the real `Api`; the legacy
direct-import path MAY coexist only while a domain is mid-migration and SHALL be
removed or quarantined by the cleanup phase. This mirrors the middleware's
dependency-injection (`createApp({ ...deps })`) and exists so a single fake can
be substituted in tests instead of per-file module mocks.

The completed #10 scope includes the remaining app-facing runtime network
consumer domains after the archived session/chat and auth slices: resource
providers, scenario registry, canvas intent, extract, smart-report/report
templates, viewer/PDF support, reset/sign-up auth helpers, and telemetry/error
capture. Type-only imports of API wire shapes MAY remain until a dedicated
type-surface cleanup moves them.

Telemetry capture for rendered runtime consumers SHALL live on
`Api.telemetry.captureException`. Production composition SHALL forward that
method to the existing Sentry wrapper, while production Sentry initialization MAY
remain outside the injected runtime capture seam.

#### Scenario: A consumer receives the injected client

- **WHEN** a component or context needs a network operation
- **THEN** it calls `useApi()` and uses the returned client
- **AND** it does NOT `import { api }` / `import { <fn> } from "@/api/..."` directly
- **AND** `useApi()` outside an `ApiProvider` throws the not-found error

#### Scenario: The session establish is single-flight on the client

- **GIVEN** the onboarding shell and the chat-session bootstrap both need the anon session
- **WHEN** either runs
- **THEN** both await one single-flight `session.ensureAnonSession()` on the injected client (one `POST /api/onboarding/session`)
- **AND** the chat-session create never fires before the session is established (no 401 / no PATCH 404 / no ownership 403)

#### Scenario: Resource providers use injected resource groups

- **WHEN** a resource provider lists, creates, updates, deletes, or searches
  buckets, documents, groups, projects, workflows, API keys, health, or search
  data
- **THEN** it calls the corresponding injected `Api` resource group
- **AND** it does not value-import `api` from `@/api`

#### Scenario: Viewer and workflow surfaces use injected extract/report groups

- **WHEN** Extract, SchemaView, ProposeSchemaFieldCard, SmartReportBuilder, or
  SmartReportRender performs a network operation
- **THEN** it calls the injected extract, template, workflow, document, or report
  group
- **AND** it does not value-import standalone API modules such as
  `@/api/extractField`, `@/api/smartReport`, or API entity modules

#### Scenario: Scenario, canvas, and telemetry runtime use injected app-facing groups

- **WHEN** scenario registry, canvas intent, sign-up/reset, PDF-viewer runtime
  code, or rendered error-capture code performs network or telemetry work
- **THEN** it reads the injected app-facing `Api` surface
- **AND** direct app-facing imports from `@/api/...` or `@/lib/sentry` are absent

#### Scenario: Runtime consumers cannot import the legacy aggregate

- **WHEN** the final frontend API injection guard scans production runtime files
- **THEN** no component, context, hook, widget, or view value-imports `@/api`
- **AND** the only remaining value imports from API implementation modules are in
  explicit implementation allowlists such as `api/client.ts` and API module tests
