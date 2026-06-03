# app-architecture Specification (delta)

## ADDED Requirements

### Requirement: Frontend network access SHALL be through an injected Api client

Frontend components and contexts SHALL obtain network operations from an injected
`Api` client via `useApi()` (provided by `ApiProvider`), NOT by importing the
`src/api` singleton or its entity modules directly. Exactly one composition root
SHALL wire the real `Api`; the legacy direct-import path MAY coexist only while a
domain is mid-migration and SHALL be removed by the cleanup phase. This mirrors
the middleware's dependency-injection (`createApp({ ...deps })`) and exists so a
single fake can be substituted in tests instead of per-file module mocks.

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
