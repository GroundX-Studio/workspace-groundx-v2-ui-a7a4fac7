# Spec Delta — app-architecture (retire MOCK_MODE)

## ADDED Requirements

### Requirement: The runtime SHALL have no mock/dev-client mode

The middleware SHALL have no `MOCK_MODE` env flag and no `Dev*` client
implementations. Every service SHALL be constructed with the real `Fetch*`
clients (`FetchGroundXClient`, `FetchGroundXPartnerClient`, `FetchLlmClient`)
in all environments; the only substitute permitted is a fake explicitly
INJECTED at the dependency seam by a test. There SHALL be no env-driven path
that swaps the real clients, returns canned chat responses, returns stubbed
extract values, or renders a report from an in-code fixture at runtime. The
`config/env` schema SHALL NOT define a `MOCK_MODE` field, no service `deps`
SHALL carry a `mockMode` flag, and a drift guard SHALL fail if `MOCK_MODE`,
`useDevClients`, a `Dev*` client class, `chatMocks`, or a `mockMode` deps field
reappears in non-test runtime code.

#### Scenario: Boot uses the real clients with no MOCK_MODE path

- **GIVEN** the middleware boots in any environment (development, test, production)
- **WHEN** it constructs the app dependencies
- **THEN** `partnerClient` / `groundxClient` / `llmClient` are the real `Fetch*` clients
- **AND** there is no `MOCK_MODE` env field, no `useDevClients` selector, and no `Dev*` client class to swap them.

#### Scenario: Tests substitute fakes at the seam, not via an env flag

- **GIVEN** a test that needs deterministic upstream behavior
- **WHEN** it constructs the service or app under test
- **THEN** it injects a `Fake*` client (or real-shaped fixture) through the dependency seam
- **AND** it does NOT set any `MOCK_MODE` env var, because no such flag exists.

#### Scenario: A reintroduced mock path fails the drift guard

- **GIVEN** the mock/dev-client drift guard
- **WHEN** non-test runtime code references `MOCK_MODE`, `useDevClients`, a `Dev*` client class, `chatMocks`, or a `mockMode` deps field
- **THEN** the guard fails
- **AND** the offending file + token are reported.
